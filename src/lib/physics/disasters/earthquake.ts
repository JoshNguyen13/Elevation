// Earthquake: the same sinusoidal acceleration on every piece, sideways and up/down. The
// platform is static, so relative to the pieces it's the ground that shakes.
// It comes in surges (a slow swell on the amplitude), and each surge peak is a "tremor" cue.
import { PLATFORM_RECT } from "@/lib/game/board";
import { MAX_TEST_DURATION_S } from "../constants";
import type { Disaster } from "./index";
import { DISASTER_NAMES } from "./names";

const QUAKE = {
  baseG: 0.12,
  gPerSecond: 0.02,
  // Ground travel is accel / (2πf)², so a rising frequency cancels the rising force (the
  // old 0.03 Hz/s kept travel flat all test). A steady rate lets the quake really grow.
  baseHz: 1.2,
  hzPerSecond: 0,
  // Vertical: each down-swing unloads the pieces and each up-swing jolts them, breaking
  // contacts so the sideways shake makes them slide, hop and walk. At a golden-ratio rate
  // to the sideways shake, so the ground traces an uneven loop that never repeats.
  // Capped under 1 g so pieces never launch.
  verticalBaseG: 0.1,
  verticalGPerSecond: 0.012,
  verticalMaxG: 0.8,
  verticalHzRatio: 1.618,
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
  let verticalPhase = 0;
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
      const hz = QUAKE.baseHz + QUAKE.hzPerSecond * t;
      phase += 2 * Math.PI * hz * dt;
      verticalPhase += 2 * Math.PI * hz * QUAKE.verticalHzRatio * dt;
      const next = surgeAt(t);
      const amplitude = (QUAKE.baseG + QUAKE.gPerSecond * t) * (QUAKE.surgeLow + QUAKE.surgeRange * next);
      if (rising && next < surge) {
        cue("tremor", { x: PLATFORM_RECT.x + PLATFORM_RECT.width / 2, y: PLATFORM_RECT.y, strength: amplitude / maxG });
      }
      rising = next > surge;
      surge = next;
      const g = amplitude * Math.sin(phase);
      const gy = Math.min(QUAKE.verticalMaxG, QUAKE.verticalBaseG + QUAKE.verticalGPerSecond * t) * Math.sin(verticalPhase);
      shake = Math.min(1, Math.hypot(g, gy) / 0.6);
      sway = g / maxG;
      strength = amplitude / maxG;
      for (const uid of pieceUids) {
        const mass = world.body(uid).mass;
        world.applyForce(uid, { x: mass * g * world.gravityAccel, y: mass * gy * world.gravityAccel });
      }
    },
    end() {},
    view: () => ({ type: "earthquake", strength, sway }),
    extraBodyUids: () => [],
    visualShake: () => shake,
  };
}
