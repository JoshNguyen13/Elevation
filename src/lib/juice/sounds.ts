// Which sound each game moment makes (sound track). The synth voices are in audio.ts.
// View only: never feeds back into the simulation.
import type { JuiceEvent } from "@/lib/game/buildSession";
import { sound } from "./audio";

export function playSoundFor(event: JuiceEvent) {
  switch (event.kind) {
    case "impact":
      sound.impact(event.strength, event.meteor);
      break;
    case "fallen":
      sound.impact(0.6);
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
        if (event.collapsed) sound.crash();
        else sound.chime();
      }
      break;
    case "disaster":
      // Disaster cues (gust, tremor, wave, meteor-incoming): none have a sound yet.
      break;
  }
}
