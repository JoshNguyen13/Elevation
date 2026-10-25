// Turns an estimate (from Gemini, or the mock) into a library item. Pure: no network,
// no files. Every number here is a tunable; because estimates are cached, changing a
// rule and running `npm run materials:rebuild` costs nothing.
import { slugify } from "./lib.mjs";

export const ARCHETYPES = ["wide-stable", "tall-narrow", "round", "flat-wide", "irregular"];
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
  // friction = base + roughness * span, clamped. The basic shapes sit at 1-1.3.
  frictionBase: 0.7,
  frictionSpan: 0.8,
  minFriction: 0.7,
  maxFriction: 1.5,
};

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

function displayName(name) {
  return name.trim().replace(/\s+/g, " ");
}

// Estimate -> Material (src/data/materials.ts). Sizes in real-world metres.
export function toMaterial(name, estimate) {
  const check = validateEstimate(estimate);
  if (!check.ok) throw new Error(`invalid estimate for "${name}": ${check.reason}`);
  const id = slugify(name);
  if (!id) throw new Error(`name "${name}" has no usable id`);
  if (RESERVED_IDS.includes(id)) throw new Error(`id "${id}" is reserved for a basic shape`);

  // Real proportions kept; only clamp to what the engine can handle.
  let width = clamp(estimate.width_m, LIMITS.minSideM, LIMITS.maxSideM);
  let height = clamp(estimate.height_m, LIMITS.minSideM, LIMITS.maxSideM);
  width = Math.max(width, height / LIMITS.maxAspect);
  height = Math.max(height, width / LIMITS.maxAspect);
  const taper = clamp(estimate.taper, LIMITS.minTaper, 1);

  let shape;
  let area;
  if (estimate.archetype === "round") {
    const radius = (width + height) / 4;
    shape = { kind: "circle", radius: round3(radius) };
    area = Math.PI * radius * radius;
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
  };
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
      if (!Array.isArray(v) || v.length < 3 || v.length > 8 || !v.every((p) => isNum(p.x) && isNum(p.y))) {
        problems.push(`${where}: convex vertices`);
      } else if (!isConvex(v)) problems.push(`${where}: convex shape is not convex`);
    } else problems.push(`${where}: unknown shape kind`);
  });
  return problems;
}
