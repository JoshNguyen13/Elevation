// Turns an estimate (from Gemini, or the mock) into a library item. Pure: no network,
// no files. Every number here is a tunable; because estimates are cached, changing a
// rule and running `npm run materials:rebuild` costs nothing.
import { slugify } from "./lib.mjs";
import {
  bounds,
  convexHull,
  flatten,
  parsePath,
  polygonArea,
  simplifyHull,
  transformPath,
} from "./svgpath.mjs";

export const ARCHETYPES = ["wide-stable", "tall-narrow", "round", "flat-wide", "irregular"];
// Longest icon path the library accepts (the meter-frame re-serialization of a silhouette).
export const MAX_ICON_PATH_CHARS = 12000;
// Ids the library may never use (they belong to the basic shapes).
export const RESERVED_IDS = ["square", "triangle", "pentagon"];

export const LIMITS = {
  // Engine-sanity clamps only. Real proportions are otherwise kept (elephant vs bottle).
  minSideM: 0.03,
  maxSideM: 12,
  maxAspect: 10,
  // A trapezoid whose top is narrower than this fraction of its base becomes a near-triangle.
  minTaper: 0.05,
  // At or above this, sides count as straight and the shape is a plain box.
  boxTaper: 0.9,
  // Relative mass: 2 * (area * density / REF) ^ MASS_POWER, clamped.
  massRef: 3.24, // a 1.8 x 1.8 m square at density 1 -> mass 2, like the basic square
  massPower: 0.35,
  minMass: 0.4,
  maxMass: 12,
  // Most hitbox points when the hull comes from a silhouette.
  maxHullVertices: 12,
  // How far an animal's hull points move out to its bounding box (FLAT_HULL_IDS), 0-1.
  flatHullBlend: 0.5,
  // friction = base + roughness * span, clamped. The basic shapes sit at 1.3-1.6. Raised
  // from 0.7-1.5 so nothing is slippery; stays under the platform's 2 (PLATFORM_FRICTION).
  frictionBase: 1,
  frictionSpan: 0.8,
  minFriction: 1,
  maxFriction: 1.8,
};

// Animals get a flatter hitbox than their silhouette's hull, so their backs can be built on
// (a giraffe's hull is otherwise a steep triangle). Ids, as slugs.
export const FLAT_HULL_IDS = ["elephant", "giraffe"];

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const round3 = (v) => Math.round(v * 1000) / 1000;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Rejects an estimate that's missing fields or implausible, so a bad answer is
// cached as invalid instead of becoming a broken item.
export function validateEstimate(estimate) {
  if (!estimate || typeof estimate !== "object") return { ok: false, reason: "not an object" };
  const { width_m, height_m, archetype, taper, density_kg_per_l, surface_roughness } = estimate;
  if (!isNum(width_m) || width_m <= 0 || width_m > 40) return { ok: false, reason: `width_m ${width_m}` };
  if (!isNum(height_m) || height_m <= 0 || height_m > 40) return { ok: false, reason: `height_m ${height_m}` };
  if (!ARCHETYPES.includes(archetype)) return { ok: false, reason: `archetype ${archetype}` };
  if (!isNum(taper) || taper < 0 || taper > 1.5) return { ok: false, reason: `taper ${taper}` };
  if (!isNum(density_kg_per_l) || density_kg_per_l < 0.01 || density_kg_per_l > 25) {
    return { ok: false, reason: `density_kg_per_l ${density_kg_per_l}` };
  }
  if (!isNum(surface_roughness) || surface_roughness < 0 || surface_roughness > 1) {
    return { ok: false, reason: `surface_roughness ${surface_roughness}` };
  }
  return { ok: true };
}

// The facts stage's answer, cleaned: implausible numbers make it invalid, a source that
// isn't one of the search results' links is dropped. links: what the search returned.
export const MAX_FACT_CHARS = 140;
export function validateFacts(facts, links = []) {
  if (!facts || typeof facts !== "object") return { ok: false, reason: "not an object" };
  const inRange = (v, lo, hi) => v === null || v === undefined || (isNum(v) && v >= lo && v <= hi);
  for (const key of ["side_width_m", "side_height_m"]) {
    if (!inRange(facts[key], 0.01, 40)) return { ok: false, reason: `${key} ${facts[key]}` };
  }
  if (!inRange(facts.weight_kg, 0.001, 20000)) return { ok: false, reason: `weight_kg ${facts.weight_kg}` };
  const text = typeof facts.fact === "string" ? facts.fact.replace(/\s+/g, " ").trim() : "";
  if (text.length < 10 || text.length > MAX_FACT_CHARS) return { ok: false, reason: `fact length ${text.length}` };
  const num = (v) => (isNum(v) ? v : null);
  return {
    ok: true,
    facts: {
      side_width_m: num(facts.side_width_m),
      side_height_m: num(facts.side_height_m),
      weight_kg: num(facts.weight_kg),
      fact: text,
      source: links.includes(facts.source) ? facts.source : null,
    },
  };
}

// Sizes from search beat Gemini's guess, unless they're so far off they're likely a
// misread (a tyre code, the box it ships in): then the estimate stands.
export const GROUNDING = { maxRatio: 4, minChange: 0.1 };
export function groundEstimate(estimate, facts) {
  const ratios = [];
  if (isNum(facts?.side_width_m)) ratios.push(facts.side_width_m / estimate.width_m);
  if (isNum(facts?.side_height_m)) ratios.push(facts.side_height_m / estimate.height_m);
  const fmt = (r) => `${r.toFixed(2)}x`;
  if (ratios.length === 0) return { estimate, sizeCheck: "unchecked", note: "no size in the search results" };
  if (ratios.some((r) => r > GROUNDING.maxRatio || r < 1 / GROUNDING.maxRatio)) {
    return { estimate, sizeCheck: "unchecked", note: `search size ignored (${ratios.map(fmt).join(", ")} the estimate)` };
  }
  if (ratios.every((r) => Math.abs(r - 1) < GROUNDING.minChange)) {
    return { estimate, sizeCheck: "confirmed", note: "search confirms the estimated size" };
  }
  const both = ratios.length === 2;
  const size = both
    ? { width_m: facts.side_width_m, height_m: facts.side_height_m }
    : { width_m: estimate.width_m * ratios[0], height_m: estimate.height_m * ratios[0] };
  const m = (v) => `${v.toFixed(2)} m`;
  return {
    estimate: { ...estimate, ...size },
    sizeCheck: "corrected",
    note: `size from search: ${m(estimate.width_m)} x ${m(estimate.height_m)} -> ${m(size.width_m)} x ${m(size.height_m)}`,
  };
}

function displayName(name) {
  return name.trim().replace(/\s+/g, " ");
}

// Estimate -> Material (src/data/materials.ts). Sizes in real-world metres.
// iconPath (optional): the raw silhouette path from the icon stage (0-100 box, y down).
// facts (optional): the facts stage's cleaned answer; corrects the size, adds the fact.
export function toMaterial(name, rawEstimate, iconPath, facts) {
  const check = validateEstimate(rawEstimate);
  if (!check.ok) throw new Error(`invalid estimate for "${name}": ${check.reason}`);
  const grounded = facts ? groundEstimate(rawEstimate, facts) : null;
  const estimate = grounded?.estimate ?? rawEstimate;
  const id = slugify(name);
  if (!id) throw new Error(`name "${name}" has no usable id`);
  if (RESERVED_IDS.includes(id)) throw new Error(`id "${id}" is reserved for a basic shape`);

  // Real proportions kept; only clamp to what the engine can handle.
  let width = clamp(estimate.width_m, LIMITS.minSideM, LIMITS.maxSideM);
  let height = clamp(estimate.height_m, LIMITS.minSideM, LIMITS.maxSideM);
  width = Math.max(width, height / LIMITS.maxAspect);
  height = Math.max(height, width / LIMITS.maxAspect);
  const taper = clamp(estimate.taper, LIMITS.minTaper, 1);

  // A silhouette (from the icon stage) decides the shape; without one, the estimate's
  // archetype + taper rules below do, as before.
  const silhouette = iconPath ? readSilhouette(iconPath) : null;

  let shape;
  let area;
  let icon;
  if (estimate.archetype === "round") {
    // Round things keep a circle hitbox so they roll; the art is centred and fitted inside.
    const radius = (width + height) / 4;
    shape = { kind: "circle", radius: round3(radius) };
    area = Math.PI * radius * radius;
    if (silhouette) {
      const { b } = silhouette;
      const scale = (2 * radius) / Math.max(b.w, b.h);
      icon = iconIn(silhouette, { x: b.minX + b.w / 2, y: b.minY + b.h / 2 }, scale);
    }
  } else if (silhouette) {
    // Same real size (bbox area = width x height), the silhouette's own proportions.
    // Frame: x centred, top edge at y = 0, y down. The hitbox is its simplified convex hull.
    const { b, points } = silhouette;
    const scale = Math.sqrt((width * height) / (b.w * b.h));
    const origin = { x: b.minX + b.w / 2, y: b.minY };
    const placed = points.map((p) => ({ x: (p.x - origin.x) * scale, y: (p.y - origin.y) * scale }));
    let outline = simplifyHull(convexHull(placed), LIMITS.maxHullVertices);
    if (FLAT_HULL_IDS.includes(id)) outline = flattenHull(outline, LIMITS.flatHullBlend);
    // Hull again after rounding to mm: on thin items (a book), rounding can put a tiny
    // dent in the outline, and the engine needs it strictly convex.
    const hull = convexHull(outline.map((p) => ({ x: round3(p.x), y: round3(p.y) })));
    shape = { kind: "convex", vertices: hull };
    area = polygonArea(hull);
    icon = iconIn(silhouette, origin, scale);
  } else if (taper >= LIMITS.boxTaper) {
    shape = { kind: "box", width: round3(width), height: round3(height) };
    area = width * height;
  } else {
    // Wide base, narrower top. y grows downward, so the top edge is y = 0.
    const top = width * taper;
    shape = {
      kind: "convex",
      vertices: [
        { x: round3(-top / 2), y: 0 },
        { x: round3(top / 2), y: 0 },
        { x: round3(width / 2), y: round3(height) },
        { x: round3(-width / 2), y: round3(height) },
      ],
    };
    area = ((width + top) / 2) * height;
  }

  const mass = clamp(
    2 * Math.pow((area * estimate.density_kg_per_l) / LIMITS.massRef, LIMITS.massPower),
    LIMITS.minMass,
    LIMITS.maxMass,
  );
  const friction = clamp(
    LIMITS.frictionBase + estimate.surface_roughness * LIMITS.frictionSpan,
    LIMITS.minFriction,
    LIMITS.maxFriction,
  );

  return {
    id,
    name: displayName(name),
    source: "generated",
    shape,
    mass: round3(mass),
    friction: round3(friction),
    archetype: estimate.archetype,
    ...(icon ? { icon } : {}),
    ...(facts
      ? { fact: { text: facts.fact, ...(facts.source ? { source: facts.source } : {}), sizeCheck: grounded.sizeCheck } }
      : {}),
  };
}

// Checks a silhouette path from the icon stage; a bad one is cached as invalid.
export function validateIcon(path) {
  try {
    readSilhouette(path);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

function readSilhouette(path) {
  const segments = parsePath(path);
  const points = flatten(segments);
  if (points.length < 3) throw new Error("silhouette has fewer than 3 points");
  if (!points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) throw new Error("NaN in silhouette");
  const b = bounds(points);
  if (!(b.w > 0.5 && b.h > 0.5)) throw new Error("silhouette has no area");
  return { segments, points, b };
}

// The art in the item's meter frame (the same frame as shape.vertices / the circle's centre).
function iconIn(silhouette, origin, scale) {
  const path = transformPath(silhouette.segments, origin, scale);
  const b = bounds(flatten(parsePath(path, MAX_ICON_PATH_CHARS)));
  const r4 = (v) => Math.round(v * 10000) / 10000;
  return { path, box: { x: r4(b.minX), y: r4(b.minY), w: r4(b.w), h: r4(b.h) } };
}

// Moves each hull point `t` of the way out to the hull's bounding box, along the ray from
// the box's centre: flatter top and sides, with the corners still rounded off.
export function flattenHull(hull, t) {
  const b = bounds(hull);
  const cx = b.minX + b.w / 2;
  const cy = b.minY + b.h / 2;
  return convexHull(
    hull.map((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const k = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
      return { x: p.x + t * (dx * k - dx), y: p.y + t * (dy * k - dy) };
    }),
  );
}

// Whether every turn has the same direction (the engine needs convex hulls).
export function isConvex(vertices) {
  let sign = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const c = vertices[(i + 2) % n];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign !== 0 && s !== sign) return false;
    sign = s;
  }
  return sign !== 0;
}

// Problems with a library file's items (empty array = fine). Used by materials:check.
export function validateLibrary(items) {
  const problems = [];
  const seen = new Set();
  if (!Array.isArray(items)) return ["library is not an array"];
  items.forEach((item, i) => {
    const where = `item ${i} (${item?.id ?? "?"})`;
    if (!item || typeof item.id !== "string" || !item.id) return problems.push(`${where}: missing id`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.id)) problems.push(`${where}: id is not a slug`);
    if (RESERVED_IDS.includes(item.id)) problems.push(`${where}: reserved id`);
    if (seen.has(item.id)) problems.push(`${where}: duplicate id`);
    seen.add(item.id);
    if (typeof item.name !== "string" || !item.name) problems.push(`${where}: missing name`);
    if (item.source !== "generated") problems.push(`${where}: source must be "generated"`);
    if (!isNum(item.mass) || item.mass < LIMITS.minMass || item.mass > LIMITS.maxMass) {
      problems.push(`${where}: mass ${item.mass} out of range`);
    }
    if (!isNum(item.friction) || item.friction < 0.3 || item.friction > 2) {
      problems.push(`${where}: friction ${item.friction} out of range`);
    }
    if (item.archetype !== undefined && !ARCHETYPES.includes(item.archetype)) {
      problems.push(`${where}: archetype ${item.archetype}`);
    }
    const s = item.shape;
    const sideOk = (v) => isNum(v) && v >= LIMITS.minSideM / 2 && v <= LIMITS.maxSideM;
    if (s?.kind === "box") {
      if (!sideOk(s.width) || !sideOk(s.height)) problems.push(`${where}: box size`);
    } else if (s?.kind === "circle") {
      if (!sideOk(s.radius)) problems.push(`${where}: circle radius`);
    } else if (s?.kind === "regularPolygon") {
      if (!Number.isInteger(s.sides) || s.sides < 3 || !sideOk(s.radius)) problems.push(`${where}: polygon`);
    } else if (s?.kind === "convex") {
      const v = s.vertices;
      if (
        !Array.isArray(v) ||
        v.length < 3 ||
        v.length > LIMITS.maxHullVertices ||
        !v.every((p) => isNum(p.x) && isNum(p.y))
      ) {
        problems.push(`${where}: convex vertices`);
      } else if (!isConvex(v)) problems.push(`${where}: convex shape is not convex`);
    } else problems.push(`${where}: unknown shape kind`);
    if (item.icon !== undefined) {
      const { path, box } = item.icon ?? {};
      // The game feeds this to Path2D and an SVG d attribute: absolute M L C Q Z and numbers only.
      if (typeof path !== "string" || path.length > MAX_ICON_PATH_CHARS || !/^[MLCQZ0-9.\- ]+$/.test(path)) {
        problems.push(`${where}: icon path`);
      } else {
        try {
          parsePath(path, MAX_ICON_PATH_CHARS);
        } catch {
          problems.push(`${where}: icon path does not parse`);
        }
      }
      if (!box || ![box.x, box.y, box.w, box.h].every(isNum) || box.w <= 0 || box.h <= 0) {
        problems.push(`${where}: icon box`);
      }
    }
    if (item.fact !== undefined) {
      const { text, source, sizeCheck } = item.fact ?? {};
      if (typeof text !== "string" || !text || text.length > MAX_FACT_CHARS) problems.push(`${where}: fact text`);
      if (source !== undefined && !(typeof source === "string" && /^https?:\/\//.test(source))) {
        problems.push(`${where}: fact source`);
      }
      if (!["corrected", "confirmed", "unchecked"].includes(sizeCheck)) problems.push(`${where}: fact sizeCheck`);
    }
  });
  return problems;
}
