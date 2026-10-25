// Earthquake: the same sinusoidal horizontal acceleration on every piece. The
// platform is static, so relative to the pieces it's the ground that shakes.
// It comes in surges (a slow swell on the amplitude), and each surge peak is a "tremor" cue.
import { PLATFORM_RECT } from "@/lib/game/board";
import { MAX_TEST_DURATION_S } from "../constants";
import type { Disaster } from "./index";
import { DISASTER_NAMES } from "./names";

const QUAKE = {
  baseG: 0.12,
  gPerSecond: 0.012,
  baseHz: 1.2,
  hzPerSecond: 0.03,
  // Amplitude swells between `surgeLow` and `surgeLow + surgeRange` every `surgePeriodS`.
  surgePeriodS: 6,
  surgeLow: 0.75,
  surgeRange: 0.55,
};

const maxG = (QUAKE.baseG + QUAKE.gPerSecond * MAX_TEST_DURATION_S) * (QUAKE.surgeLow + QUAKE.surgeRange);

// 0–1, peaking mid-period.
const surgeAt = (t: number) => (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / QUAKE.surgePeriodS)) ** 2;

export function createEarthquake(side: 1 | -1): Disaster {
  let phase = 0;
  let shake = 0;
  let sway = 0;
  let strength = 0;
  let surge = 0;
  let rising = false;
  return {
    type: "earthquake",
    name: DISASTER_NAMES.earthquake,
    label: "⚠ Earthquake — Intensifying",
    side,
    apply({ world, pieceUids, t, dt, cue }) {
      phase += 2 * Math.PI * (QUAKE.baseHz + QUAKE.hzPerSecond * t) * dt;
      const next = surgeAt(t);
      const amplitude = (QUAKE.baseG + QUAKE.gPerSecond * t) * (QUAKE.surgeLow + QUAKE.surgeRange * next);
      if (rising && next < surge) {
        cue("tremor", { x: PLATFORM_RECT.x + PLATFORM_RECT.width / 2, y: PLATFORM_RECT.y, strength: amplitude / maxG });
      }
      rising = next > surge;
      surge = next;
      const g = amplitude * Math.sin(phase);
      shake = Math.min(1, Math.abs(g) / 0.6);
      sway = g / maxG;
      strength = amplitude / maxG;
      const accel = g * world.gravityAccel;
      for (const uid of pieceUids) world.applyForce(uid, { x: world.body(uid).mass * accel, y: 0 });
    },
    end() {},
    view: () => ({ type: "earthquake", strength, sway }),
    extraBodyUids: () => [],
    visualShake: () => shake,
  };
}
