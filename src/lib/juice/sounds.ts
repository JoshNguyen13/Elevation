// Which sound each game moment makes (sound track). The synth voices are in audio.ts.
// View only: never feeds back into the simulation.
import { BOARD_WIDTH_PX } from "@/lib/game/board";
import type { JuiceEvent } from "@/lib/game/buildSession";
import { sound } from "./audio";

// Board x → stereo position, kept within ±0.6 so nothing sits hard in one ear.
function panFor(x?: number) {
  return x === undefined ? undefined : Math.min(0.6, Math.max(-0.6, (x / BOARD_WIDTH_PX - 0.5) * 1.2));
}

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
    case "phase": {
      if (event.phase === "testing") {
        sound.whoosh();
        if (event.disaster) sound.startAmbience(event.disaster);
      } else if (event.phase === "done") {
        sound.stopAmbience(1.5);
        if (event.collapsed) sound.crash();
        else sound.chime();
      } else {
        // Any other phase means a new round: never let a loop carry over.
        sound.stopAmbience(0.2);
        if (event.phase === "settling") sound.timeUp();
      }
      break;
    }
    case "disaster": {
      const pan = panFor(event.x);
      // Clamped: a cue's strength comes from another track's tuning.
      const s = Math.min(1, Math.max(0, event.strength ?? 1));
      // The newer disasters reuse the closest voice until they get their own.
      if (event.cue === "gust" || event.cue === "twister") sound.gust(s, pan);
      else if (event.cue === "swat") sound.gust(s * 0.6, pan);
      else if (event.cue === "tremor") sound.tremor(s, pan);
      else if (event.cue === "meteor-incoming" || event.cue === "fat-guy-incoming") sound.meteorIncoming(s, pan);
      break;
    }
  }
}

// --- Audition (dev only) ---------------------------------------------------------
// window.__sound.preview("gust", 0.8) fakes the event, so it plays exactly what the
// game would (throttles included). No name, or an unknown one, lists them all.

// Entries that return nothing act directly instead of faking an event.
const PREVIEWS: Record<string, (strength: number) => JuiceEvent | void> = {
  impact: (strength) => ({ kind: "impact", x: 0, y: 0, strength, meteor: false }),
  "impact-meteor": (strength) => ({ kind: "impact", x: 0, y: 0, strength, meteor: true }),
  // 30 impacts in one frame, of random strengths: checks the throttle and the limiter.
  "impact-burst": () => {
    for (let i = 0; i < 30; i++) playSoundFor({ kind: "impact", x: 0, y: 0, strength: Math.random(), meteor: false });
  },
  fallen: () => ({ kind: "fallen", x: 0, y: 0 }),
  place: () => ({ kind: "place" }),
  pickup: () => ({ kind: "pickup" }),
  rotate: () => ({ kind: "rotate" }),
  tick: () => ({ kind: "tick", secondsLeft: 8 }),
  "tick-final": () => ({ kind: "tick", secondsLeft: 3 }),
  "time-up": () => ({ kind: "phase", phase: "settling" }),
  whoosh: () => ({ kind: "phase", phase: "testing" }),
  crash: () => ({ kind: "phase", phase: "done", collapsed: true }),
  chime: () => ({ kind: "phase", phase: "done", collapsed: false }),
  gust: (strength) => ({ kind: "disaster", cue: "gust", strength }),
  tremor: (strength) => ({ kind: "disaster", cue: "tremor", strength }),
  "meteor-incoming": (strength) => ({ kind: "disaster", cue: "meteor-incoming", strength }),
  "fat-guy-incoming": (strength) => ({ kind: "disaster", cue: "fat-guy-incoming", strength }),
  twister: (strength) => ({ kind: "disaster", cue: "twister", strength }),
  swat: (strength) => ({ kind: "disaster", cue: "swat", strength }),
  // The test starting with a disaster: the whoosh, then that disaster's loop.
  "ambience-wind": () => ({ kind: "phase", phase: "testing", disaster: "wind" }),
  "ambience-earthquake": () => ({ kind: "phase", phase: "testing", disaster: "earthquake" }),
  "ambience-fat-guy": () => ({ kind: "phase", phase: "testing", disaster: "fat-guy" }),
  "ambience-meteor": () => ({ kind: "phase", phase: "testing", disaster: "meteor" }),
  "ambience-tornado": () => ({ kind: "phase", phase: "testing", disaster: "tornado" }),
  "ambience-cat": () => ({ kind: "phase", phase: "testing", disaster: "cat" }),
  "ambience-stop": () => sound.stopAmbience(1.5),
};

function preview(name?: string, strength = 0.5) {
  const make = name ? PREVIEWS[name] : undefined;
  if (!make) {
    console.info(`__sound.preview(name, strength = 0.5). Names: ${Object.keys(PREVIEWS).join(", ")}. Volume: __sound.setVolume(0–1).`);
    return;
  }
  sound.unlock();
  if (sound.isMuted()) console.warn("__sound.preview: sound is muted (speaker button under the zoom controls).");
  const event = make(Math.min(1, Math.max(0, strength)));
  if (event) playSoundFor(event);
}

if (process.env.NODE_ENV !== "production") Object.assign(sound, { preview });
