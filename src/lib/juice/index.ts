// Turns game moments (BuildSession.drainJuice()) into sound, particles and shake.
// View-only: it reads events and never writes back into the simulation.
// What each moment does lives in sounds.ts (sound track) and effects.ts (disasters track).
import type { JuiceEvent, Phase } from "@/lib/game/buildSession";
import { showEffectsFor } from "./effects";
import { Particles } from "./particles";
import { Shake } from "./shake";
import { playSoundFor } from "./sounds";

export { sound } from "./audio";

export class Juice {
  readonly particles = new Particles();
  readonly shake = new Shake();

  handle(events: JuiceEvent[], phase: Phase) {
    for (const event of events) {
      playSoundFor(event);
      showEffectsFor(event, phase, this.particles, this.shake);
    }
  }

  update(dtMs: number) {
    this.particles.update(dtMs);
    this.shake.update(dtMs);
  }
}
