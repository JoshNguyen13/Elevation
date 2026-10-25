// Deterministic fake estimates for testing the pipeline and the game with ZERO API
// calls. The output goes to src/data/items.mock.json, never the real library.
// Sizes deliberately span a wide range, so the daily-fit scaling, the platform width
// and the zoom all get exercised.
import { ARCHETYPES } from "./convert.mjs";

function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function mockEstimate(name) {
  const next = rng(hash(`mock:${name}`));
  // Log-uniform longest side, 0.12 m to 4 m: bottle-sized to elephant-sized.
  const longest = 0.12 * Math.pow(4 / 0.12, next());
  const archetype = ARCHETYPES[Math.floor(next() * ARCHETYPES.length)];
  const aspect = {
    "wide-stable": 0.6 + next() * 0.3,
    "tall-narrow": 2 + next() * 2,
    round: 1,
    "flat-wide": 0.15 + next() * 0.2,
    irregular: 0.7 + next() * 0.8,
  }[archetype];
  // aspect = height / width
  const width = aspect >= 1 ? longest / aspect : longest;
  const height = aspect >= 1 ? longest : longest * aspect;
  return {
    width_m: Math.round(width * 1000) / 1000,
    height_m: Math.round(height * 1000) / 1000,
    archetype,
    taper: archetype === "irregular" ? 0.15 + next() * 0.5 : next() < 0.25 ? 0.2 + next() * 0.5 : 1,
    density_kg_per_l: Math.round((0.2 + next() * 3) * 100) / 100,
    surface_roughness: Math.round(next() * 100) / 100,
  };
}
