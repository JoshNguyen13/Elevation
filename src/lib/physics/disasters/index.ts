// Disaster force models for the Testing Phase (§4.10). Each one is applied
// before every fixed physics step and escalates with seconds survived.
// Every magnitude is TBD — first-pass values, tune by playtesting. Forces are
// expressed as multiples of Matter's gravity so they read as "fractions of g".
//
// Determinism: a disaster may only use the rng passed to createDisaster, in a fixed
// call order, so the same seed plays out the same for everyone (same day = same disaster).
import type { DisasterType } from "@/lib/supabase/types";
import type { PhysicsWorld } from "../world";
import { createCat } from "./cat";
import { createEarthquake } from "./earthquake";
import { createFatGuy } from "./fatGuy";
import { createMeteor } from "./meteor";
import { createTornado } from "./tornado";
import { createWind } from "./wind";

export { DISASTER_NAMES, DISASTER_TYPES } from "./names";

// Moments a disaster wants heard or seen. Raise one with step.cue(); the view layer maps
// each to sound (src/lib/juice/sounds.ts) and visuals (src/lib/juice/effects.ts), and
// ignores cues it doesn't know yet. Physics never reads them. Add names here as needed,
// and list them in docs/tracks/disasters.md for the sound track.
export type DisasterCue =
  | "gust" // wind: a gust peaks
  | "tremor" // earthquake: a surge peaks
  | "fat-guy-incoming" // fat guy: a jump is coming (the warning shows), x = where he lands
  | "meteor-incoming" // meteor: one is about to fly in from the side, y = its height
  | "twister" // tornado: the funnel sweeps through the tower
  | "swat"; // cat: the paw strikes

export interface DisasterStep {
  world: PhysicsWorld;
  // Uids of the pieces still in the world.
  pieceUids: readonly string[];
  // Seconds since the test started, and the step length in seconds.
  t: number;
  dt: number;
  // Raise a cue at a board point; strength 0–1 (default 1).
  cue(cue: DisasterCue, detail?: { x?: number; y?: number; strength?: number }): void;
}

// A disaster body (fat guy, meteor, paw) in board px, for drawing.
export interface Projectile {
  uid: string;
  x: number;
  y: number;
  radius: number;
  angle: number;
  vx: number;
  vy: number;
}

// What the view needs to draw a disaster (src/lib/game/disasterVisuals.ts and the
// page backdrop). Board px. `strength` is 0–1: how hard the disaster is hitting now.
// Read-only snapshots: physics never reads them back.
export type DisasterView =
  | { type: "wind"; strength: number; gust: number }
  | { type: "earthquake"; strength: number; sway: number }
  | { type: "fat-guy"; strength: number; guys: Projectile[]; warning: { x: number; inS: number } | null }
  | { type: "meteor"; strength: number; rocks: Projectile[]; warning: { y: number; inS: number } | null }
  | { type: "tornado"; strength: number; coreX: number; radius: number }
  | {
      type: "cat";
      strength: number;
      paw: Projectile | null;
      stage: "idle" | "windup" | "strike" | "retract";
      swatY: number;
    };

export interface Disaster {
  readonly type: DisasterType;
  readonly name: string;
  // Top-bar chip text (Figma "03 — Testing Phase").
  readonly label: string;
  // +1 or -1 (seeded): the way this disaster pushes or travels across the board.
  // Wind blows toward it; meteors fly toward it; the cat swats toward it.
  readonly side: 1 | -1;
  apply(step: DisasterStep): void;
  // Called once when the test ends: removes bodies that shouldn't linger (the cat's paw).
  end(world: PhysicsWorld): void;
  view(): DisasterView;
  // Non-piece bodies to draw (projectiles).
  extraBodyUids(): readonly string[];
  // 0–1 continuous screen shake for the view layer (the earthquake). Never affects physics.
  visualShake(): number;
}

// Where the run is on its way to the disaster, for the view's build-up (BuildSession.buildUp()).
// View only: the build-up never touches physics, so building is the same on every disaster day.
export interface DisasterBuildUp {
  disaster: Disaster;
  // "build": the timer is running. "final": settling + height reveal, the last approach.
  stage: "build" | "final" | "testing" | "done";
  // Share of the build time used, 0–1 (stays where it was once the build ends).
  build: number;
  // Share of the final approach done, 0–1 (1 from the test on).
  final: number;
  // Seconds into the test.
  testS: number;
  // The standing tower in board px, or null when nothing is placed.
  tower: { cx: number; minX: number; maxX: number; top: number } | null;
}

export function createDisaster(type: DisasterType, rng: () => number): Disaster {
  const side = rng() < 0.5 ? -1 : 1;
  switch (type) {
    case "wind":
      return createWind(side);
    case "earthquake":
      return createEarthquake(side);
    case "fat-guy":
      return createFatGuy(side, rng);
    case "meteor":
      return createMeteor(side, rng);
    case "tornado":
      return createTornado(side);
    case "cat":
      return createCat(side, rng);
  }
}

// Small seeded PRNG (mulberry32) so a day's disaster plays out the same for everyone.
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
