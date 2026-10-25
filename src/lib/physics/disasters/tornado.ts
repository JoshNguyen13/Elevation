// Tornado: a funnel enters from one edge and sweeps back and forth through the tower,
// wider and stronger over time. Inside it, pieces are lifted (gravity partly cancelled,
// so the tower goes light and floaty), pulled toward the core and churned side to side
// with height. Forces scale with mass, so they don't depend on the day's piece scale.
import { BOARD_WIDTH_PX, PLATFORM_RECT } from "@/lib/game/board";
import type { Disaster } from "./index";
import { DISASTER_NAMES } from "./names";
import { testProgress, towerSpan } from "./shared";

const TORNADO = {
  // The core slides in from the edge over this long.
  entryS: 2.5,
  baseRadiusPx: 70,
  radiusPerS: 0.8,
  // Back-and-forth sweep around the tower's center: amplitude grows, period is fixed.
  baseSweepPx: 40,
  sweepPerS: 1,
  sweepPeriodS: 8,
  // Accelerations at the core, in g: lift (against gravity), pull toward the core, and churn.
  baseLift: 0.25,
  liftPerS: 0.008,
  inward: 0.04,
  churn: 0.06,
  churnPerS: 0.003,
  churnHz: 0.7,
};

export function createTornado(side: 1 | -1): Disaster {
  let coreX = side > 0 ? -TORNADO.baseRadiusPx : BOARD_WIDTH_PX + TORNADO.baseRadiusPx;
  let radius = TORNADO.baseRadiusPx;
  let center: number | null = null;
  let strength = 0;
  return {
    type: "tornado",
    name: DISASTER_NAMES.tornado,
    label: "⚠ Tornado — Touching Down",
    side,
    apply({ world, pieceUids, t, cue }) {
      if (center === null) {
        const span = towerSpan(world, pieceUids);
        center = (span.minX + span.maxX) / 2;
      }
      radius = TORNADO.baseRadiusPx + TORNADO.radiusPerS * t;
      const start = side > 0 ? -radius : BOARD_WIDTH_PX + radius;
      // Enter toward the tower, then sweep through it, starting in the direction it came.
      const prevX = coreX;
      if (t < TORNADO.entryS) {
        const k = t / TORNADO.entryS;
        coreX = start + (center - start) * (1 - (1 - k) * (1 - k));
      } else {
        const amplitude = TORNADO.baseSweepPx + TORNADO.sweepPerS * t;
        coreX = center + side * amplitude * Math.sin((2 * Math.PI * (t - TORNADO.entryS)) / TORNADO.sweepPeriodS);
      }
      strength = 0.3 + 0.7 * testProgress(t);
      if ((prevX - center) * (coreX - center) <= 0 && prevX !== coreX) {
        cue("twister", { x: coreX, y: PLATFORM_RECT.y - 80, strength });
      }

      const g = world.gravityAccel;
      const lift = TORNADO.baseLift + TORNADO.liftPerS * t;
      const churn = TORNADO.churn + TORNADO.churnPerS * t;
      for (const uid of pieceUids) {
        const body = world.body(uid);
        const dx = body.position.x - coreX;
        const inside = Math.max(0, 1 - Math.abs(dx) / radius);
        if (inside === 0) continue;
        const swirl = Math.sin(2 * Math.PI * TORNADO.churnHz * t + body.position.y / 35);
        world.applyForce(uid, {
          x: (-Math.sign(dx) * TORNADO.inward + swirl * churn) * body.mass * inside * g,
          y: -Math.min(lift, 0.95) * body.mass * inside * g,
        });
      }
    },
    end() {},
    view: () => ({ type: "tornado", strength, coreX, radius }),
    extraBodyUids: () => [],
    visualShake: () => 0,
  };
}
