"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ensurePlayer,
  fetchOwnScore,
  fetchPlayedCount,
  isOnlineMode,
  loadPuzzle,
  submitScore,
} from "@/lib/daily/api";
import { addDays, utcDateString } from "@/lib/daily/date";
import { generatePuzzle, type DailyPuzzle } from "@/lib/daily/puzzle";
import { runFromScoreRow, type RunSummary } from "@/lib/daily/run";
import {
  getDeviceId,
  getLocalDisplayName,
  hasSeenTutorial,
  loadSavedRun,
  markTutorialSeen,
  saveRun,
  setLocalDisplayName,
} from "@/lib/daily/storage";
import { sound } from "@/lib/juice";
import { DISASTER_TYPES } from "@/lib/physics/disasters";
import BuildPhase from "./BuildPhase";
import IntroScreen from "./IntroScreen";
import ResultsScreen from "./ResultsScreen";
import TutorialScreen from "./TutorialScreen";

type Screen = "intro" | "tutorial" | "play" | "results";

// Dev Lab (/dev, dev only): a hand-picked puzzle, always practice and fully local.
export interface DevRun {
  puzzle: DailyPuzzle;
  buildSeconds?: number;
  startAt: "intro" | "tutorial" | "play";
}

interface Loaded {
  puzzle: DailyPuzzle;
  deviceId: string;
  displayName: string | null;
  // Today's finished run (saved locally or on the server), if this device already played.
  run: RunSummary | null;
  practice: boolean;
  playedYesterday: number | null;
}

// Dev-only switches: ?replay=1 runs unsubmitted practice rounds, ?disaster=tornado forces the
// disaster, ?date=2026-11-03 previews that day's puzzle (practice only, generated locally, so
// nothing is read from or written to the shared database for that date).
function devOverrides() {
  if (process.env.NODE_ENV === "production") return { practice: false, disaster: null, date: null };
  const params = new URLSearchParams(window.location.search);
  const disaster = DISASTER_TYPES.find((d) => d === params.get("disaster")) ?? null;
  const dateParam = params.get("date");
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
  return { practice: params.has("replay") || date !== null, disaster, date };
}

async function load(dev?: DevRun): Promise<Loaded> {
  if (dev) {
    const local = { deviceId: getDeviceId(), displayName: getLocalDisplayName() };
    return { puzzle: dev.puzzle, ...local, run: null, practice: true, playedYesterday: null };
  }
  const { practice, disaster, date: previewDate } = devOverrides();
  const date = previewDate ?? utcDateString();
  const deviceId = getDeviceId();

  const [fetched, serverName, playedYesterday] = await Promise.all([
    previewDate ? generatePuzzle(date) : loadPuzzle(date),
    practice ? null : ensurePlayer(deviceId),
    fetchPlayedCount(addDays(date, -1)),
  ]);
  const puzzle = disaster ? { ...fetched, disaster } : fetched;
  const displayName = serverName ?? getLocalDisplayName();
  if (serverName) setLocalDisplayName(serverName);

  let run: RunSummary | null = null;
  if (!practice) {
    const saved = loadSavedRun(date);
    if (saved) {
      run = saved.run;
      // The score never reached the server last time (offline?): try again now.
      if (!saved.submitted && (await submitScore(deviceId, saved.run))) {
        saveRun(date, { run: saved.run, submitted: true });
      }
    } else {
      // Storage was cleared but the server remembers this device's score.
      const row = await fetchOwnScore(deviceId, date);
      if (row) run = runFromScoreRow(row, puzzle);
    }
  }
  return { puzzle, deviceId, displayName, run, practice, playedYesterday };
}

// Daily intro → build + test → results, around today's puzzle (§6) and this device's
// identity and one attempt per day (§7).
export default function Game({ dev }: { dev?: DevRun }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [screen, setScreen] = useState<Screen>(dev?.startAt ?? "intro");
  const [run, setRun] = useState<RunSummary | null>(null);
  // Where the tutorial leads when it's done: into a run, or back to the intro.
  const [afterTutorial, setAfterTutorial] = useState<"play" | "intro">("play");

  // Browsers only allow audio after a user gesture: unlock it on the first click or key.
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(dev).then((result) => {
      if (cancelled) return;
      setLoaded(result);
      setRun(result.run);
      if (result.run) setScreen("results");
    });
    return () => {
      cancelled = true;
    };
  }, [dev]);

  const practice = loaded?.practice ?? false;
  const deviceId = loaded?.deviceId;

  const handleComplete = useCallback(
    (finished: RunSummary) => {
      setRun(finished);
      if (practice || !deviceId) return;
      saveRun(finished.date, { run: finished, submitted: false });
      submitScore(deviceId, finished).then((ok) => {
        if (ok) saveRun(finished.date, { run: finished, submitted: true });
      });
    },
    [practice, deviceId],
  );

  if (!loaded) return null;

  const alreadyPlayed = run !== null && !practice;

  if (screen === "tutorial") {
    return (
      <TutorialScreen
        ctaLabel={afterTutorial === "play" ? "Got it — Start Building" : "Got it"}
        onDone={() => {
          markTutorialSeen();
          setScreen(afterTutorial);
        }}
      />
    );
  }

  if (screen === "play") {
    return (
      <BuildPhase
        puzzle={loaded.puzzle}
        onComplete={handleComplete}
        onContinue={() => setScreen("results")}
        buildSeconds={dev?.buildSeconds}
      />
    );
  }

  if (screen === "results" && run) {
    return (
      <ResultsScreen
        run={run}
        itemIds={loaded.puzzle.itemIds}
        deviceId={loaded.deviceId}
        displayName={loaded.displayName}
        online={isOnlineMode()}
        practice={practice}
        onNameSaved={(name) => setLoaded((prev) => (prev ? { ...prev, displayName: name } : prev))}
      />
    );
  }

  return (
    <IntroScreen
      puzzle={loaded.puzzle}
      alreadyPlayed={alreadyPlayed}
      practice={practice}
      playedYesterday={loaded.playedYesterday}
      onStart={() => {
        if (alreadyPlayed) return setScreen("results");
        // First-time players see the tutorial once, on the way into their first run.
        if (!hasSeenTutorial()) {
          setAfterTutorial("play");
          return setScreen("tutorial");
        }
        setScreen("play");
      }}
      onHowToPlay={() => {
        setAfterTutorial("intro");
        setScreen("tutorial");
      }}
    />
  );
}
