"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DailyPuzzle } from "@/lib/daily/puzzle";
import { BoardView } from "@/lib/game/boardView";
import { SIM_SPEEDS, type BuildSnapshot } from "@/lib/game/buildSession";
import { ParPlayback, runPar, storedPar, type ParEntry, type ParOutcome } from "@/lib/game/parSolver";
import BoardCanvas from "./BoardCanvas";
import styles from "./ParCard.module.css";

interface ParCardProps {
  puzzle: DailyPuzzle;
  // The player's combined score, to compare.
  yourScore: number;
}

const survival = (o: { survivedS: number; collapsed: boolean }) =>
  o.collapsed ? `collapsed at ${Math.round(o.survivedS)}s` : `survived all ${Math.round(o.survivedS)}s`;

const noop = () => {};

// "Best tower found": the day's par (lib/game/parSolver.ts), replayed from its stored moves so
// the numbers always match the current game, beside the player's score. Nothing shows when the
// day has no par, or its moves no longer play. "Watch it" plays that tower through the disaster.
export default function ParCard({ puzzle, yourScore }: ParCardProps) {
  const [par, setPar] = useState<{ entry: ParEntry; outcome: ParOutcome } | null>(null);
  const [watching, setWatching] = useState(0);

  // Replaying takes ~0.1s: after the first paint, not during it.
  useEffect(() => {
    const timer = setTimeout(() => {
      const entry = storedPar(puzzle);
      const outcome = entry && runPar(puzzle, entry.moves, entry.waitSteps);
      setPar(entry && outcome ? { entry, outcome } : null);
    }, 0);
    return () => clearTimeout(timer);
  }, [puzzle]);

  if (!par) return null;
  const { outcome } = par;
  const diff = yourScore - outcome.combined;
  return (
    <section className={styles.card} aria-label="Best tower found">
      <div className={styles.head}>
        <div>
          <p className={styles.label}>BEST TOWER FOUND</p>
          <p className={styles.value}>{outcome.combined}</p>
          <p className={styles.note}>
            {outcome.band} · {outcome.heightM.toFixed(1)} m · {survival(outcome)}
          </p>
          <p className={styles.versus}>
            {diff > 0 ? `You beat it by ${diff}!` : diff === 0 ? "You matched it!" : `You: ${yourScore} (${diff})`}
          </p>
        </div>
        <button type="button" className={styles.watch} onClick={() => setWatching(1)}>
          Watch it
        </button>
      </div>
      {watching > 0 && (
        <div className={styles.overlay} role="dialog" aria-modal aria-label="Best tower found, replayed" onClick={() => setWatching(0)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHead}>
              <p className={styles.label}>BEST TOWER FOUND · SCORE {outcome.combined}</p>
              <div className={styles.actions}>
                <button type="button" className={styles.watch} onClick={() => setWatching((n) => n + 1)}>
                  Replay
                </button>
                <button type="button" className={styles.watch} onClick={() => setWatching(0)} aria-label="Close">
                  ✕
                </button>
              </div>
            </div>
            <ParReplay key={watching} puzzle={puzzle} entry={par.entry} onClose={() => setWatching(0)} />
          </div>
        </div>
      )}
    </section>
  );
}

// What the replay is doing now, under the board.
function replayStatus(snapshot: BuildSnapshot): string {
  const { phase, pieces, result, outcome, disasterName, testSeconds } = snapshot;
  if (phase === "build") return `Placing ${pieces.filter((p) => p.status !== "tray").length} / ${pieces.length}`;
  if (phase === "settling") return "Settling…";
  if (phase === "measured" && result) return `Height: ${result.heightM.toFixed(1)} m · ${result.band}`;
  if (phase === "done" && outcome) return `${disasterName}: ${survival(outcome)}`;
  return `${disasterName} · ${testSeconds}s`;
}

// The par tower built piece by piece, then the disaster, all live (ParPlayback places each
// piece at the solver's exact step, so it ends on the same score). Esc closes it.
function ParReplay({ puzzle, entry, onClose }: { puzzle: DailyPuzzle; entry: ParEntry; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view] = useState(() => new BoardView());
  const [session] = useState(() => new ParPlayback(puzzle, entry));
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={styles.replay}>
      <div>
        <BoardCanvas
          canvasRef={canvasRef}
          session={session}
          view={view}
          zoomed={false}
          isDragging={false}
          onPointerDown={noop}
          onPointerMove={noop}
          onPointerUp={noop}
        />
      </div>
      <div className={styles.status}>
        <p className={styles.note}>{replayStatus(snapshot)}</p>
        {snapshot.phase === "testing" && (
          <div className={styles.actions} role="group" aria-label="Disaster speed">
            {SIM_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                className={styles.speed}
                aria-pressed={snapshot.speed === speed}
                onClick={() => session.setSpeed(speed)}
              >
                {speed}x
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
