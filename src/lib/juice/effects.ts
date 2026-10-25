// Which particles and screen shake each game moment makes (disasters track).
// View only: never feeds back into the simulation.
import type { JuiceEvent, Phase } from "@/lib/game/buildSession";
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
    case "disaster":
      // Disaster cues (gust, tremor, wave, meteor-incoming): none have visuals yet.
      break;
  }
}
