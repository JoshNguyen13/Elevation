// Turns game moments (BuildSession.drainJuice()) into sound, particles and shake.
// View-only: it reads events and never writes back into the simulation.
import type { JuiceEvent, Phase } from "@/lib/game/buildSession";
import { colors } from "@/lib/theme";
import { sound } from "./audio";
import { Particles } from "./particles";
import { Shake } from "./shake";

export { sound } from "./audio";

export class Juice {
  readonly particles = new Particles();
  readonly shake = new Shake();

  // `phase` gates the shake: only while the disaster runs, so it never offsets a drop.
  handle(events: JuiceEvent[], phase: Phase) {
    const shaking = phase === "testing";
    for (const event of events) {
      switch (event.kind) {
        case "impact": {
          const s = event.strength;
          sound.impact(s, event.meteor);
          if (event.meteor) {
            this.particles.burst(event.x, event.y, { count: 22, color: colors.textMuted, speed: 0.28, size: 2.6, life: 700, upward: false });
            if (shaking) this.shake.add(0.35 + s * 0.4);
          } else if (s > 0.08) {
            this.particles.burst(event.x, event.y, { count: Math.round(3 + s * 12), color: colors.tick, speed: 0.06 + s * 0.14 });
            if (shaking) this.shake.add(s * 0.3);
          }
          break;
        }
        case "fallen":
          sound.impact(0.6);
          this.particles.burst(event.x, event.y, { count: 14, color: colors.ink, speed: 0.16, size: 2, life: 650 });
          if (shaking) this.shake.add(0.2);
          break;
        case "place":
          sound.place();
          break;
        case "pickup":
          sound.pickup();
          break;
        case "rotate":
          sound.rotate();
          break;
        case "tick":
          sound.tick(event.secondsLeft);
          break;
        case "phase":
          if (event.phase === "settling") sound.timeUp();
          else if (event.phase === "testing") sound.whoosh();
          else if (event.phase === "done") {
            if (event.collapsed) {
              sound.crash();
              this.shake.add(0.7);
            } else sound.chime();
          }
          break;
      }
    }
  }

  update(dtMs: number) {
    this.particles.update(dtMs);
    this.shake.update(dtMs);
  }
}
