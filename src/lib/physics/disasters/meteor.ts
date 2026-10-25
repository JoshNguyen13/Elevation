// Meteor shower: fireballs fly in from one side on a shallow arc (Angry Birds style),
// aimed at the tower. They come more often, bigger and faster over time. The first one
// hits the upper tower at the start of the test (the one the backdrop has been building
// up to); later ones are announced at the board edge first.
import { BOARD_HEIGHT_PX, BOARD_WIDTH_PX, PLATFORM_RECT } from "@/lib/game/board";
import type { PhysicsWorld } from "../world";
import type { Disaster } from "./index";
import { DISASTER_NAMES } from "./names";
import { aimVy, gravityPerStep, isOffBoard, projectilesOf, testProgress, towerSpan } from "./shared";

const METEOR = {
  warnS: 1,
  baseIntervalS: 5,
  minIntervalS: 1.8,
  intervalShrinkPerS: 0.05,
  baseRadiusPx: 8,
  radiusPerS: 0.06,
  baseMass: 1,
  massPerS: 0.05,
  // Horizontal launch speed, px per step.
  baseSpeed: 8,
  speedPerS: 0.05,
  // Launch height above the aim point, px: a random amount in [minRise, minRise + riseRange].
  minRise: 20,
  riseRange: 110,
  maxAgeS: 5,
};

interface Shot {
  // Launch height and the point it's aimed at, board px.
  y: number;
  targetX: number;
  targetY: number;
  at: number;
}

export function createMeteor(side: 1 | -1, rng: () => number): Disaster {
  let nextAt = 0;
  let count = 0;
  let pending: Shot | null = null;
  let strength = 0;
  let now = 0;
  let world: PhysicsWorld | null = null;
  const live: { uid: string; bornAt: number; radius: number }[] = [];
  // Enters just inside the edge it comes from (fully outside would count as gone).
  const entryX = (radius: number) => (side > 0 ? -radius + 1 : BOARD_WIDTH_PX + radius - 1);
  const clampY = (y: number) => Math.min(Math.max(y, 24), PLATFORM_RECT.y - 12);
  return {
    type: "meteor",
    name: DISASTER_NAMES.meteor,
    label: "⚠ Meteor Shower — Incoming",
    side,
    apply(step) {
      const { pieceUids, t, cue } = step;
      world = step.world;
      now = t;
      strength = 0.3 + 0.7 * testProgress(t);
      for (let i = live.length - 1; i >= 0; i--) {
        const { uid, bornAt } = live[i];
        if (isOffBoard(world.body(uid)) || t - bornAt > METEOR.maxAgeS) {
          world.removePiece(uid);
          live.splice(i, 1);
        }
      }

      const span = towerSpan(world, pieceUids);
      const radius = METEOR.baseRadiusPx + METEOR.radiusPerS * t;
      // Pick the next shot early so it can be announced (three rng calls per shot, after the first).
      if (!pending && count > 0 && t >= nextAt - METEOR.warnS) {
        const targetX = span.minX + rng() * (span.maxX - span.minX);
        const targetY = span.top + rng() * Math.max(0, PLATFORM_RECT.y - 6 - span.top);
        pending = { targetX, targetY, y: clampY(targetY - METEOR.minRise - rng() * METEOR.riseRange), at: nextAt };
        cue("meteor-incoming", { x: entryX(radius), y: pending.y, strength: Math.min(1, radius / 20) });
      }
      if (t < nextAt) return;

      // The first shot: the upper third of the tower, from a fixed height above it.
      const targetY = span.top + (PLATFORM_RECT.y - span.top) / 3;
      const shot = pending ?? { targetX: (span.minX + span.maxX) / 2, targetY, y: clampY(targetY - 50), at: t };
      pending = null;
      nextAt = t + Math.max(METEOR.minIntervalS, METEOR.baseIntervalS - METEOR.intervalShrinkPerS * t);

      const speed = METEOR.baseSpeed + METEOR.speedPerS * t;
      const x = entryX(radius);
      const vy = aimVy(shot.targetX - x, shot.targetY - shot.y, speed, gravityPerStep(world));
      const uid = `meteor-rock-${count++}`;
      world.addMeteor(uid, x, shot.y, radius, METEOR.baseMass + METEOR.massPerS * t, { x: side * speed, y: vy });
      live.push({ uid, bornAt: t, radius });
    },
    end() {},
    view: () => ({
      type: "meteor",
      strength,
      rocks: projectilesOf(world, live).filter((r) => r.y - r.radius < BOARD_HEIGHT_PX),
      warning: pending && { y: pending.y, inS: Math.max(0, pending.at - now) },
    }),
    extraBodyUids: () => live.map((r) => r.uid),
    visualShake: () => 0,
  };
}
