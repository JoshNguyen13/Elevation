// Big ol' fat guy: he cannonballs onto the tower from above, again and again, a bit
// bigger and faster each time. The first jump lands on the tower's middle at the start of
// the test (the one the backdrop has been building up to); later ones get a warning first.
import { BOARD_HEIGHT_PX } from "@/lib/game/board";
import type { PhysicsWorld } from "../world";
import type { Disaster } from "./index";
import { DISASTER_NAMES } from "./names";
import { isOffBoard, projectilesOf, testProgress, towerSpan } from "./shared";

const FAT_GUY = {
  // The landing spot is shown this long before each jump after the first.
  warnS: 1.3,
  baseIntervalS: 7,
  minIntervalS: 3.2,
  intervalShrinkPerS: 0.06,
  baseRadiusPx: 15,
  radiusPerS: 0.08,
  baseMass: 4,
  massPerS: 0.08,
  // Initial downward speed, px per step.
  baseSpeed: 6,
  speedPerS: 0.06,
  maxAgeS: 8,
};

export function createFatGuy(side: 1 | -1, rng: () => number): Disaster {
  let nextAt = 0;
  let count = 0;
  let pending: { x: number; at: number } | null = null;
  let strength = 0;
  let now = 0;
  let world: PhysicsWorld | null = null;
  const live: { uid: string; bornAt: number; radius: number }[] = [];
  return {
    type: "fat-guy",
    name: DISASTER_NAMES["fat-guy"],
    label: "⚠ Big Ol' Fat Guy — Cannonball!",
    side,
    apply(step) {
      const { pieceUids, t, cue } = step;
      world = step.world;
      now = t;
      strength = 0.35 + 0.65 * testProgress(t);
      for (let i = live.length - 1; i >= 0; i--) {
        const { uid, bornAt } = live[i];
        if (isOffBoard(world.body(uid)) || t - bornAt > FAT_GUY.maxAgeS) {
          world.removePiece(uid);
          live.splice(i, 1);
        }
      }

      const span = towerSpan(world, pieceUids);
      // Pick the next landing spot early so it can be shown (one rng call per jump, after the first).
      if (!pending && count > 0 && t >= nextAt - FAT_GUY.warnS) {
        pending = { x: span.minX + rng() * (span.maxX - span.minX), at: nextAt };
        cue("fat-guy-incoming", { x: pending.x, y: span.top, strength: Math.min(1, 0.5 + strength / 2) });
      }
      if (t < nextAt) return;

      const x = pending?.x ?? (span.minX + span.maxX) / 2;
      pending = null;
      nextAt = t + Math.max(FAT_GUY.minIntervalS, FAT_GUY.baseIntervalS - FAT_GUY.intervalShrinkPerS * t);
      const radius = FAT_GUY.baseRadiusPx + FAT_GUY.radiusPerS * t;
      const uid = `meteor-guy-${count++}`;
      world.addMeteor(uid, x, -radius, radius, FAT_GUY.baseMass + FAT_GUY.massPerS * t, {
        x: 0,
        y: FAT_GUY.baseSpeed + FAT_GUY.speedPerS * t,
      });
      live.push({ uid, bornAt: t, radius });
    },
    end() {},
    view: () => ({
      type: "fat-guy",
      strength,
      guys: projectilesOf(world, live).filter((g) => g.y - g.radius < BOARD_HEIGHT_PX),
      warning: pending && { x: pending.x, inS: Math.max(0, pending.at - now) },
    }),
    extraBodyUids: () => live.map((g) => g.uid),
    visualShake: () => 0,
  };
}
