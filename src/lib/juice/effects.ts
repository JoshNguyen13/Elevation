// Which particles and screen shake each game moment makes (disasters track).
// View only: never feeds back into the simulation.
import type { JuiceEvent, Phase } from "@/lib/game/buildSession";
import { FX } from "@/lib/game/disasterArt";
import { colors } from "@/lib/theme";
import type { Particles } from "./particles";
import type { Shake } from "./shake";

// `phase` gates the shake: only while the disaster runs, so it never offsets a drop.
export function showEffectsFor(event: JuiceEvent, phase: Phase, particles: Particles, shake: Shake) {
  const shaking = phase === "testing";
  switch (event.kind) {
    case "impact": {
      const s = event.strength;
      if (event.meteor) {
        particles.burst(event.x, event.y, { count: 22, color: colors.textMuted, speed: 0.28, size: 2.6, life: 700, upward: false });
        if (shaking) shake.add(0.35 + s * 0.4);
      } else if (s > 0.08) {
        particles.burst(event.x, event.y, { count: Math.round(3 + s * 12), color: colors.tick, speed: 0.06 + s * 0.14 });
        if (shaking) shake.add(s * 0.3);
      }
      break;
    }
    case "fallen":
      particles.burst(event.x, event.y, { count: 14, color: colors.ink, speed: 0.16, size: 2, life: 650 });
      if (shaking) shake.add(0.2);
      break;
    case "phase":
      if (event.phase === "done" && event.collapsed) shake.add(0.7);
      break;
    case "disaster": {
      // The continuous look of each disaster is drawn in src/lib/game/disasterVisuals.ts;
      // these are the one-off bursts at its dramatic moments.
      const s = event.strength;
      const x = event.x ?? 200;
      const y = event.y ?? 300;
      switch (event.cue) {
        case "gust":
          particles.burst(x, y, { count: Math.round(6 + s * 14), color: FX.leaf, speed: 0.3 + s * 0.2, size: 2, life: 900, upward: false });
          if (shaking) shake.add(0.1 + s * 0.15);
          break;
        case "tremor":
          particles.burst(x, y, { count: Math.round(10 + s * 24), color: FX.dust, speed: 0.08 + s * 0.14, size: 2.4, life: 800 });
          if (shaking) shake.add(0.2 + s * 0.35);
          break;
        case "fat-guy-incoming":
          // The landing shadow and "!" are drawn; the landing itself is a meteor impact.
          break;
        case "meteor-incoming":
          particles.burst(x, y, { count: 8, color: FX.ember, speed: 0.12, size: 1.8, life: 500, upward: false });
          break;
        case "twister":
          particles.burst(x, y, { count: Math.round(12 + s * 18), color: colors.textMuted, speed: 0.22, size: 2, life: 700, upward: false });
          if (shaking) shake.add(0.15 + s * 0.2);
          break;
        case "swat":
          if (shaking) shake.add(0.3 + s * 0.3);
          break;
      }
      break;
    }
  }
}
