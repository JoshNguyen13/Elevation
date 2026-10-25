// High wind: a gusting horizontal force on each piece, proportional to its
// exposed height and stronger higher up. Wind speed ramps with time.
import { BOARD_WIDTH_PX, PLATFORM_RECT } from "@/lib/game/board";
import { MAX_TEST_DURATION_S } from "../constants";
import type { Disaster } from "./index";
import { DISASTER_NAMES } from "./names";
import { elevation, verticalExtent } from "./shared";

const WIND = {
  base: 0.4,
  perSecond: 0.04,
  // Force per px of exposed height, in g × mass-units. A 40px piece at intensity 1 ≈ 0.6 g-units.
  pressure: 0.015,
  // A gust cue needs the gust this strong, and at least this long since the last one.
  cueAbove: 0.95,
  cueGapS: 1.5,
};

const maxIntensity = WIND.base + WIND.perSecond * MAX_TEST_DURATION_S;

// 0.35–1.15: a slow 4s swell with a faster flutter on top.
const gustAt = (t: number) => 0.75 + 0.25 * Math.sin((2 * Math.PI * t) / 4) + 0.15 * Math.sin((2 * Math.PI * t) / 1.3);

export function createWind(side: 1 | -1): Disaster {
  let gust = gustAt(0);
  let rising = false;
  let lastCueAt = -Infinity;
  let strength = 0;
  return {
    type: "wind",
    name: DISASTER_NAMES.wind,
    label: "⚠ High Wind — Intensifying",
    side,
    apply({ world, pieceUids, t, cue }) {
      const intensity = WIND.base + WIND.perSecond * t;
      const next = gustAt(t);
      // A gust peaks where it stops rising.
      if (rising && next < gust && gust > WIND.cueAbove && t - lastCueAt > WIND.cueGapS) {
        lastCueAt = t;
        cue("gust", {
          x: side > 0 ? 0 : BOARD_WIDTH_PX,
          y: PLATFORM_RECT.y - 160,
          strength: Math.min(1, (intensity * gust) / maxIntensity),
        });
      }
      rising = next > gust;
      gust = next;
      strength = Math.min(1, (intensity * gust) / maxIntensity);
      for (const uid of pieceUids) {
        const body = world.body(uid);
        const fx = WIND.pressure * intensity * gust * verticalExtent(body).height * (0.5 + elevation(body));
        world.applyForce(uid, { x: side * fx * world.gravityAccel, y: 0 });
      }
    },
    end() {},
    view: () => ({ type: "wind", strength, gust: Math.min(1, Math.max(0, (gust - 0.35) / 0.8)) }),
    extraBodyUids: () => [],
    visualShake: () => 0,
  };
}
