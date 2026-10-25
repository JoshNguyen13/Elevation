// npm run materials:test: unit tests for the pure conversion rules (node:test, no deps).
import assert from "node:assert/strict";
import { test } from "node:test";
import { isConvex, toMaterial, validateEstimate, validateLibrary } from "./convert.mjs";
import { mockEstimate } from "./mock.mjs";

const base = {
  width_m: 1,
  height_m: 1,
  archetype: "wide-stable",
  taper: 1,
  density_kg_per_l: 1,
  surface_roughness: 0.5,
};

test("a straight-sided object becomes a box with real proportions", () => {
  const item = toMaterial("Brick", { ...base, width_m: 0.215, height_m: 0.065, archetype: "flat-wide" });
  assert.equal(item.id, "brick");
  assert.equal(item.shape.kind, "box");
  assert.equal(item.shape.width, 0.215);
  assert.equal(item.shape.height, 0.065);
});

test("a cone becomes a convex trapezoid with the narrow edge on top", () => {
  const item = toMaterial("Traffic cone", { ...base, width_m: 0.4, height_m: 0.7, taper: 0.15, archetype: "tall-narrow" });
  assert.equal(item.shape.kind, "convex");
  const [topLeft, topRight, bottomRight] = item.shape.vertices;
  assert.ok(topRight.x - topLeft.x < bottomRight.x * 2);
  assert.ok(isConvex(item.shape.vertices));
});

test("round objects become circles", () => {
  const item = toMaterial("Soccer ball", { ...base, width_m: 0.22, height_m: 0.22, archetype: "round" });
  assert.deepEqual(item.shape, { kind: "circle", radius: 0.11 });
});

test("an elephant stays enormous next to a ketchup bottle (pure proportions)", () => {
  const elephant = toMaterial("Elephant", { ...base, width_m: 4, height_m: 3, density_kg_per_l: 1 });
  const bottle = toMaterial("Ketchup bottle", { ...base, width_m: 0.07, height_m: 0.2, density_kg_per_l: 1.1 });
  assert.ok(elephant.shape.width / bottle.shape.width > 50);
});

test("mass is compressed and clamped, so an elephant is not 1000x a bottle", () => {
  const elephant = toMaterial("Elephant", { ...base, width_m: 4, height_m: 3 });
  const bottle = toMaterial("Ketchup bottle", { ...base, width_m: 0.07, height_m: 0.2 });
  assert.ok(elephant.mass / bottle.mass < 40);
  assert.ok(bottle.mass >= 0.4 && elephant.mass <= 12);
});

test("very thin objects are clamped to a sane aspect ratio", () => {
  const item = toMaterial("Plank", { ...base, width_m: 3, height_m: 0.001, archetype: "flat-wide" });
  assert.ok(item.shape.width / item.shape.height <= 10.01);
});

test("friction follows roughness within range", () => {
  assert.equal(toMaterial("Ice block", { ...base, surface_roughness: 0 }).friction, 0.7);
  assert.equal(toMaterial("Sandpaper block", { ...base, surface_roughness: 1 }).friction, 1.5);
});

test("bad estimates are rejected, not turned into items", () => {
  for (const bad of [
    null,
    {},
    { ...base, width_m: -1 },
    { ...base, height_m: "tall" },
    { ...base, archetype: "blobby" },
    { ...base, surface_roughness: 3 },
    { ...base, density_kg_per_l: 0 },
  ]) {
    assert.equal(validateEstimate(bad).ok, false);
  }
  assert.throws(() => toMaterial("Nope", { ...base, width_m: 0 }));
});

test("ids can't collide with the basic shapes", () => {
  assert.throws(() => toMaterial("Square", base), /reserved/);
});

test("mock estimates are deterministic and always valid", () => {
  for (const name of ["a", "elephant", "ketchup bottle", "x".repeat(40)]) {
    assert.deepEqual(mockEstimate(name), mockEstimate(name));
    assert.equal(validateEstimate(mockEstimate(name)).ok, true);
    assert.deepEqual(validateLibrary([toMaterial(name, mockEstimate(name))]), []);
  }
});

test("a non-convex shape fails library validation", () => {
  const bowtie = {
    id: "bowtie",
    name: "Bowtie",
    source: "generated",
    mass: 1,
    friction: 1,
    shape: { kind: "convex", vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }] },
  };
  assert.ok(validateLibrary([bowtie]).some((p) => p.includes("not convex")));
});
