// npm run materials:test: SVG silhouette parsing, hull, and icon -> item conversion.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isConvex, toMaterial, validateIcon, validateLibrary } from "./convert.mjs";
import {
  bounds,
  convexHull,
  flatten,
  insideConvex,
  parsePath,
  polygonArea,
  simplifyHull,
  transformPath,
} from "./svgpath.mjs";

// A crude elephant: body, trunk hanging down at the front, four legs (concave between them).
const ELEPHANT =
  "M10 40 C10 20 40 15 60 20 L80 22 C92 25 95 40 92 60 L90 85 L88 100 L82 100 L80 75 L75 75 " +
  "L73 100 L67 100 L65 70 L35 70 L33 100 L27 100 L25 75 L20 75 L18 100 L12 100 L10 70 Z";

function distanceToPolygon(vertices, p) {
  let best = Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

const estimate = {
  width_m: 3.5,
  height_m: 3,
  archetype: "wide-stable",
  taper: 1,
  density_kg_per_l: 1,
  surface_roughness: 0.6,
};

test("parses absolute and relative commands, including H V S T", () => {
  const segs = parsePath("M0 0 h10 v10 H0 Z m20 20 l5 0 c1 1 2 2 3 3 s4 4 5 5 q1 1 2 2 t3 3 z");
  assert.deepEqual(segs[1], { type: "L", p: { x: 10, y: 0 } });
  assert.deepEqual(segs[2], { type: "L", p: { x: 10, y: 10 } });
  assert.deepEqual(segs[3], { type: "L", p: { x: 0, y: 10 } });
  // relative m after Z starts from the subpath start (0,0)
  assert.deepEqual(segs[5], { type: "M", p: { x: 20, y: 20 } });
  assert.equal(segs.filter((s) => s.type === "C").length, 2); // c + s
  assert.equal(segs.filter((s) => s.type === "Q").length, 2); // q + t
});

test("implicit lineto after M, and compact numbers like 1.5.5 and -3-4", () => {
  const segs = parsePath("M0 0 10 0 10 10L1.5.5-3-4z");
  assert.deepEqual(segs.map((s) => s.type), ["M", "L", "L", "L", "L", "Z"]);
  assert.deepEqual(segs[4].p, { x: -3, y: -4 });
});

test("rejects arcs, junk and huge paths", () => {
  assert.throws(() => parsePath("M0 0 A5 5 0 0 1 10 10"), /characters|unsupported/);
  assert.throws(() => parsePath("<script>"), /characters/);
  assert.throws(() => parsePath("10 10 L 5 5"), /start with a command/);
  assert.throws(() => parsePath(`M0 0 ${"L1 1 ".repeat(2000)}`), /too long/);
  assert.equal(validateIcon("M0 0 L0 0 Z").ok, false); // no area
});

test("curves are sampled, so the hull covers a bulge", () => {
  const points = flatten(parsePath("M0 100 C0 0 100 0 100 100 Z"));
  const b = bounds(points);
  assert.ok(b.minY < 30, `curve top sampled (minY ${b.minY})`);
});

test("hull drops interior points, simplify keeps it convex and close in area", () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }];
  assert.equal(convexHull(square).length, 4);
  const circle = Array.from({ length: 40 }, (_, i) => ({
    x: Math.cos((i / 40) * 2 * Math.PI) * 10,
    y: Math.sin((i / 40) * 2 * Math.PI) * 10,
  }));
  const hull = convexHull(circle);
  const simple = simplifyHull(hull, 12);
  assert.equal(simple.length, 12);
  assert.ok(isConvex(simple));
  assert.ok(polygonArea(simple) / polygonArea(hull) > 0.93);
});

test("an icon item: convex hull hitbox, same real size, art in the same frame", () => {
  const item = toMaterial("Elephant", estimate, ELEPHANT);
  assert.equal(item.shape.kind, "convex");
  assert.ok(item.shape.vertices.length <= 12);
  assert.ok(isConvex(item.shape.vertices));
  // bbox area equals the estimate's width x height (same real size)
  const { w, h } = item.icon.box;
  assert.ok(Math.abs(w * h - 3.5 * 3) / (3.5 * 3) < 0.01, `box ${w} x ${h}`);
  // art frame: x centred, top at 0
  assert.ok(Math.abs(item.icon.box.x + w / 2) < 0.01 && Math.abs(item.icon.box.y) < 0.01);
  // The hitbox covers the drawn outline: simplifying to 12 points replaces curves with
  // chords, so the art may poke out a little, but never by more than 3% of its size.
  const art = flatten(parsePath(item.icon.path, 12000));
  const hull = item.shape.vertices;
  const overhang = Math.max(...art.map((p) => (insideConvex(hull, p, 1e-9) ? 0 : distanceToPolygon(hull, p))));
  assert.ok(overhang <= 0.03 * Math.max(w, h), `art pokes out of the hitbox by ${overhang.toFixed(3)} m`);
  assert.deepEqual(validateLibrary([item]), []);
});

test("a round item keeps its circle hitbox with the art centred inside", () => {
  const ball = toMaterial("Soccer ball", { ...estimate, archetype: "round", width_m: 0.22, height_m: 0.22 }, "M50 0 C78 0 100 22 100 50 C100 78 78 100 50 100 C22 100 0 78 0 50 C0 22 22 0 50 0 Z");
  assert.deepEqual(ball.shape, { kind: "circle", radius: 0.11 });
  const { x, y, w, h } = ball.icon.box;
  assert.ok(Math.abs(x + w / 2) < 0.002 && Math.abs(y + h / 2) < 0.002, "centred on the circle");
  assert.ok(Math.max(w, h) <= 0.2201, "fits the diameter");
});

test("a very thin item (a book) still gets a strictly convex hitbox after rounding", () => {
  // The real cached answer that once produced a dented hull.
  const book = toMaterial(
    "Hardcover book",
    { ...estimate, width_m: 0.16, height_m: 0.03, archetype: "flat-wide" },
    "M5 60 C5 58 7 56 10 56 L90 56 C93 56 95 58 95 60 L95 96 C95 98 93 100 90 100 L10 100 C7 100 5 98 5 96 Z",
  );
  assert.ok(isConvex(book.shape.vertices));
  assert.deepEqual(validateLibrary([book]), []);
});

test("without an icon, items are built exactly as before", () => {
  const plain = toMaterial("Brick", { ...estimate, width_m: 0.215, height_m: 0.065 });
  assert.equal(plain.shape.kind, "box");
  assert.equal(plain.icon, undefined);
});

test("transformPath output is absolute M/L/C/Q/Z only (what the game accepts)", () => {
  const out = transformPath(parsePath("m0 0 h10 s5 5 10 10 t5 5 z"), { x: 0, y: 0 }, 0.5);
  assert.match(out, /^[MLCQZ0-9.\- ]+$/);
});

test("library validation rejects a hostile icon path", () => {
  const item = toMaterial("Elephant", estimate, ELEPHANT);
  const bad = { ...item, icon: { ...item.icon, path: 'M0 0"/><script>alert(1)</script>' } };
  assert.ok(validateLibrary([bad]).some((p) => p.includes("icon path")));
});
