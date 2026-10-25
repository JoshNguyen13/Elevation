// Disaster force models for the Testing Phase (§4.10). Each one is applied
// before every fixed physics step and escalates with seconds survived.
// Every magnitude is TBD — first-pass values, tune by playtesting. Forces are
// expressed as multiples of Matter's gravity so they read as "fractions of g".
import type Matter from "matter-js";
import { BOARD_HEIGHT_PX, BOARD_WIDTH_PX, PLATFORM_RECT } from "@/lib/game/board";
import { MAX_STACK_PX } from "@/lib/game/dailyScale";
import type { DisasterType } from "@/lib/supabase/types";
import type { PhysicsWorld } from "./world";

export const DISASTER_TYPES: readonly DisasterType[] = ["wind", "earthquake", "flood", "meteor"];

export const DISASTER_NAMES: Record<DisasterType, string> = {
  wind: "High Wind",
  earthquake: "Earthquake",
  flood: "Flood",
  meteor: "Meteor Shower",
};

// Moments a disaster wants heard or seen. Raise one with step.cue(); the view layer maps
// each to sound (src/lib/juice/sounds.ts) and visuals (src/lib/juice/effects.ts), and
// ignores cues it doesn't know yet. Physics never reads them. Add names here as needed.
export type DisasterCue = "gust" | "tremor" | "wave" | "meteor-incoming";

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

export interface Disaster {
  readonly type: DisasterType;
  readonly name: string;
  // Top-bar chip text (Figma "03 — Testing Phase").
  readonly label: string;
  apply(step: DisasterStep): void;
  // Water surface in board px, for drawing (flood only).
  waterLineY(): number | null;
  // Non-piece bodies to draw (meteors).
  extraBodyUids(): readonly string[];
  // 0–1 continuous screen shake for the view layer (the earthquake). Never affects physics.
  visualShake(): number;
}

function verticalExtent(body: Matter.Body) {
  return { top: body.bounds.min.y, bottom: body.bounds.max.y, height: body.bounds.max.y - body.bounds.min.y };
}

// 0 at the platform top, 1 at the max possible height.
function elevation(body: Matter.Body): number {
  return Math.min(Math.max((PLATFORM_RECT.y - body.position.y) / MAX_STACK_PX, 0), 1);
}

// High wind: a gusting horizontal force on each piece, proportional to its
// exposed height and stronger higher up. Wind speed ramps with time.
const WIND = {
  base: 0.4,
  perSecond: 0.04,
  // Force per px of exposed height, in g × mass-units. A 40px piece at intensity 1 ≈ 0.6 g-units.
  pressure: 0.015,
};

function createWind(direction: 1 | -1): Disaster {
  return {
    type: "wind",
    name: DISASTER_NAMES.wind,
    label: "⚠ High Wind — Intensifying",
    apply({ world, pieceUids, t }) {
      const intensity = WIND.base + WIND.perSecond * t;
      const gust = 0.75 + 0.25 * Math.sin((2 * Math.PI * t) / 4) + 0.15 * Math.sin((2 * Math.PI * t) / 1.3);
      for (const uid of pieceUids) {
        const body = world.body(uid);
        const fx = WIND.pressure * intensity * gust * verticalExtent(body).height * (0.5 + elevation(body));
        world.applyForce(uid, { x: direction * fx * world.gravityAccel, y: 0 });
      }
    },
    waterLineY: () => null,
    extraBodyUids: () => [],
    visualShake: () => 0,
  };
}

// Earthquake: the same sinusoidal horizontal acceleration on every piece. The
// platform is static, so relative to the pieces it's the ground that shakes.
const QUAKE = {
  baseG: 0.12,
  gPerSecond: 0.012,
  baseHz: 1.2,
  hzPerSecond: 0.03,
};

function createEarthquake(): Disaster {
  let phase = 0;
  let shake = 0;
  return {
    type: "earthquake",
    name: DISASTER_NAMES.earthquake,
    label: "⚠ Earthquake — Intensifying",
    apply({ world, pieceUids, t, dt }) {
      phase += 2 * Math.PI * (QUAKE.baseHz + QUAKE.hzPerSecond * t) * dt;
      const g = (QUAKE.baseG + QUAKE.gPerSecond * t) * Math.sin(phase);
      shake = Math.min(1, Math.abs(g) / 0.6);
      const accel = g * world.gravityAccel;
      for (const uid of pieceUids) world.applyForce(uid, { x: world.body(uid).mass * accel, y: 0 });
    },
    waterLineY: () => null,
    extraBodyUids: () => [],
    visualShake: () => shake,
  };
}

// Flood: a rising water line. Submerged pieces get buoyancy (by area), a
// sideways current and drag, which loosens the base first.
const FLOOD = {
  // Starts just below the platform top, rising faster over time (px/s, px/s²).
  startBelowPlatformPx: 20,
  riseSpeed: 3,
  riseAccel: 0.08,
  // Mass per px² of displaced water. Pieces lighter than this float.
  waterDensity: 0.0018,
  current: 0.006,
  currentPerSecond: 0.0003,
  // Fraction of velocity removed per step when fully submerged.
  drag: 0.02,
};

function createFlood(direction: 1 | -1): Disaster {
  let waterY = PLATFORM_RECT.y + FLOOD.startBelowPlatformPx;
  return {
    type: "flood",
    name: DISASTER_NAMES.flood,
    label: "⚠ Flood — Water Rising",
    apply({ world, pieceUids, t }) {
      waterY = PLATFORM_RECT.y + FLOOD.startBelowPlatformPx - (FLOOD.riseSpeed * t + 0.5 * FLOOD.riseAccel * t * t);
      const g = world.gravityAccel;
      // Matter turns force into a velocity change of force / mass × step², so this
      // removes FLOOD.drag of the velocity per step.
      const stepMsSq = (1000 / 60) ** 2;
      for (const uid of pieceUids) {
        const body = world.body(uid);
        const { bottom, height } = verticalExtent(body);
        const submerged = Math.min(Math.max((bottom - waterY) / height, 0), 1);
        if (submerged === 0) continue;
        const dragK = (FLOOD.drag * submerged * body.mass) / stepMsSq;
        const current = (FLOOD.current + FLOOD.currentPerSecond * t) * submerged * height * g;
        world.applyForce(uid, {
          x: direction * current - dragK * body.velocity.x,
          y: -FLOOD.waterDensity * body.area * submerged * g - dragK * body.velocity.y,
        });
      }
    },
    waterLineY: () => waterY,
    extraBodyUids: () => [],
    visualShake: () => 0,
  };
}

// Meteor: rocks dropped at random spots above the tower; each impact is one
// big impulse. They come more often and get bigger and faster over time.
const METEOR = {
  firstAtS: 2,
  baseIntervalS: 6,
  minIntervalS: 2.5,
  intervalShrinkPerS: 0.05,
  baseRadiusPx: 7,
  radiusPerS: 0.12,
  baseMass: 2,
  massPerS: 0.12,
  // Initial downward speed, px per step.
  baseSpeed: 10,
  speedPerS: 0.1,
  maxAgeS: 6,
};

function createMeteor(rng: () => number): Disaster {
  let nextAt = METEOR.firstAtS;
  let count = 0;
  const live: { uid: string; bornAt: number }[] = [];
  return {
    type: "meteor",
    name: DISASTER_NAMES.meteor,
    label: "⚠ Meteor Shower — Intensifying",
    apply({ world, pieceUids, t, cue }) {
      for (let i = live.length - 1; i >= 0; i--) {
        const { uid, bornAt } = live[i];
        const { bounds } = world.body(uid);
        const gone = bounds.min.y > BOARD_HEIGHT_PX || bounds.max.x < 0 || bounds.min.x > BOARD_WIDTH_PX;
        if (gone || t - bornAt > METEOR.maxAgeS) {
          world.removePiece(uid);
          live.splice(i, 1);
        }
      }
      if (t < nextAt) return;
      nextAt = t + Math.max(METEOR.minIntervalS, METEOR.baseIntervalS - METEOR.intervalShrinkPerS * t);

      // Aim somewhere over the tower (or the platform if nothing is left).
      let minX = PLATFORM_RECT.x;
      let maxX = PLATFORM_RECT.x + PLATFORM_RECT.width;
      if (pieceUids.length > 0) {
        minX = Math.min(...pieceUids.map((uid) => world.body(uid).bounds.min.x));
        maxX = Math.max(...pieceUids.map((uid) => world.body(uid).bounds.max.x));
      }
      const radius = METEOR.baseRadiusPx + METEOR.radiusPerS * t;
      const uid = `meteor-${count++}`;
      const x = minX + rng() * (maxX - minX);
      cue("meteor-incoming", { x, y: 0, strength: Math.min(1, radius / 20) });
      world.addMeteor(
        uid,
        x,
        -radius,
        radius,
        METEOR.baseMass + METEOR.massPerS * t,
        { x: (rng() - 0.5) * 4, y: METEOR.baseSpeed + METEOR.speedPerS * t },
      );
      live.push({ uid, bornAt: t });
    },
    waterLineY: () => null,
    extraBodyUids: () => live.map((m) => m.uid),
    visualShake: () => 0,
  };
}

export function createDisaster(type: DisasterType, rng: () => number): Disaster {
  const direction = rng() < 0.5 ? -1 : 1;
  switch (type) {
    case "wind":
      return createWind(direction);
    case "earthquake":
      return createEarthquake();
    case "flood":
      return createFlood(direction);
    case "meteor":
      return createMeteor(rng);
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
