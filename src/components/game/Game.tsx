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
import type { DailyPuzzle } from "@/lib/daily/puzzle";
import { runFromScoreRow, type RunSummary } from "@/lib/daily/run";
import { getDeviceId, getLocalDisplayName, loadSavedRun, saveRun, setLocalDisplayName } from "@/lib/daily/storage";
import { DISASTER_TYPES } from "@/lib/physics/disasters";
import BuildPhase from "./BuildPhase";
import IntroScreen from "./IntroScreen";
import ResultsScreen from "./ResultsScreen";

type Screen = "intro" | "play" | "results";

interface Loaded {
  puzzle: DailyPuzzle;
  deviceId: string;
  displayName: string | null;
  // Today's finished run (saved locally or on the server), if this device already played.
  run: RunSummary | null;
  practice: boolean;
  playedYesterday: number | null;
}

// Dev-only switches: ?replay=1 runs unsubmitted practice rounds, ?disaster=flood forces the disaster.
function devOverrides() {
  if (process.env.NODE_ENV === "production") return { practice: false, disaster: null };
  const params = new URLSearchParams(window.location.search);
  const disaster = DISASTER_TYPES.find((d) => d === params.get("disaster")) ?? null;
  return { practice: params.has("replay"), disaster };
}

async function load(): Promise<Loaded> {
  const date = utcDateString();
  const { practice, disaster } = devOverrides();
  const deviceId = getDeviceId();

  const [fetched, serverName, playedYesterday] = await Promise.all([
    loadPuzzle(date),
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
export default function Game() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [screen, setScreen] = useState<Screen>("intro");
  const [run, setRun] = useState<RunSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    load().then((result) => {
      if (cancelled) return;
      setLoaded(result);
      setRun(result.run);
      if (result.run) setScreen("results");
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (screen === "play") {
    return <BuildPhase puzzle={loaded.puzzle} onComplete={handleComplete} onContinue={() => setScreen("results")} />;
  }

  if (screen === "results" && run) {
    return (
      <ResultsScreen
        run={run}
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
      alreadyPlayed={run !== null && !practice}
      practice={practice}
      playedYesterday={loaded.playedYesterday}
      onStart={() => setScreen(run && !practice ? "results" : "play")}
    />
  );
}
