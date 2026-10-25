"use client";

import { useEffect, useState, type FormEvent } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import {
  cleanDisplayName,
  DISPLAY_NAME_MAX,
  fetchLeaderboard,
  fetchStanding,
  playerLabel,
  saveDisplayName,
  type LeaderboardEntry,
  type Standing,
} from "@/lib/daily/api";
import { getMaterial } from "@/data/materials";
import { dayNumber, formatCountdown, msUntilRollover } from "@/lib/daily/date";
import { hashString, type DailyPuzzle } from "@/lib/daily/puzzle";
import type { RunSummary } from "@/lib/daily/run";
import { setLocalDisplayName } from "@/lib/daily/storage";
import ParCard from "./ParCard";
import styles from "./ResultsScreen.module.css";

const PREVIEW_ROWS = 5;
const FULL_ROWS = 25;

interface ResultsScreenProps {
  run: RunSummary;
  // The day's puzzle: its pieces for the "Did you know?" fact, and the best tower found (ParCard).
  puzzle: DailyPuzzle;
  deviceId: string;
  displayName: string | null;
  // Supabase is configured: the standing and leaderboard are real.
  online: boolean;
  // A ?replay=1 run: not submitted, so it isn't on the board.
  practice: boolean;
  onNameSaved: (name: string) => void;
}

interface Board {
  standing: Standing | null;
  entries: LeaderboardEntry[];
}

function formatSurvival(run: RunSummary) {
  const seconds = Math.round(run.survivedS);
  return run.collapsed
    ? `Collapsed after ${seconds}s of ${run.disasterName}`
    : `Survived ${seconds}s of ${run.disasterName}`;
}

// One real-world fact about one of the day's pieces, the same for every player that day.
function factOfTheDay(date: string, itemIds: string[]) {
  const withFacts = [...new Set(itemIds)].map(getMaterial).filter((m) => m.fact);
  if (withFacts.length === 0) return null;
  const material = withFacts[hashString(`fact:${date}`) % withFacts.length];
  return { name: material.name, ...material.fact! };
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// 04 — Results (Figma): score cards, percentile, today's leaderboard.
export default function ResultsScreen({
  run,
  puzzle,
  deviceId,
  displayName,
  online,
  practice,
  onNameSaved,
}: ResultsScreenProps) {
  const [board, setBoard] = useState<Board | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Bumped after a rename so the leaderboard reloads with the new name.
  const [reloads, setReloads] = useState(0);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [copied, setCopied] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    (async () => {
      const [standing, entries] = await Promise.all([
        fetchStanding(run.date, run.combined, !practice),
        fetchLeaderboard(run.date, expanded ? FULL_ROWS : PREVIEW_ROWS),
      ]);
      if (!cancelled) setBoard({ standing, entries });
    })();
    return () => {
      cancelled = true;
    };
  }, [online, practice, run.date, run.combined, expanded, reloads]);

  useEffect(() => {
    const tick = () => setRemainingMs(msUntilRollover());
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    const name = cleanDisplayName(nameDraft);
    if (!name || savingName) return;
    setSavingName(true);
    setLocalDisplayName(name);
    if (online) await saveDisplayName(deviceId, name);
    setSavingName(false);
    onNameSaved(name);
    setReloads((n) => n + 1);
  };

  const share = async () => {
    const standing = board?.standing;
    const lines = [
      `Elevation Day #${dayNumber(run.date)}`,
      `Height: ${run.band} (${Math.round(run.heightPercent)}% of max)`,
      `Stability: ${run.stability.toFixed(1)} / 5.0 (${run.disasterName})`,
      standing?.beatPercent != null
        ? `Score: ${run.combined}, beat ${standing.beatPercent}% of players`
        : `Score: ${run.combined}`,
      window.location.origin,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: nothing useful to do.
    }
  };

  // The leaderboard, with the player's own row appended (at its real rank) if it's below the cut.
  const standing = board?.standing ?? null;
  const rows: { entry: LeaderboardEntry; gap?: boolean }[] = (board?.entries ?? []).map((entry) => ({ entry }));
  if (online && !practice && board && !rows.some((r) => r.entry.playerId === deviceId) && standing) {
    rows.push({
      entry: { playerId: deviceId, name: displayName, combined: run.combined, rank: standing.rank },
      gap: true,
    });
  }

  let percentile: string;
  if (!online) percentile = "The shared leaderboard is offline";
  else if (!board) percentile = "Checking today's players…";
  else if (!standing) percentile = "Couldn't reach the leaderboard";
  else if (standing.beatPercent === null) percentile = "You're the first player today";
  else percentile = `You beat ${standing.beatPercent}% of today's players`;

  const fact = factOfTheDay(run.date, puzzle.itemIds);
  const factHost = fact?.source ? hostOf(fact.source) : null;

  return (
    <div className={styles.screen}>
      <header className={styles.topBar}>
        <h1 className={styles.title}>Run Complete</h1>
        <Badge>Day #{dayNumber(run.date)}</Badge>
      </header>

      <div className={styles.body}>
        <div className={styles.summary}>
          <div className={styles.cards}>
            <section className={styles.card}>
              <p className={styles.cardLabel}>HEIGHT</p>
              <p className={styles.cardValue}>{run.band}</p>
              <p className={styles.cardNote}>
                {Math.round(run.heightPercent)}% of max height · {run.heightM.toFixed(1)} m
              </p>
            </section>
            <section className={styles.card}>
              <p className={styles.cardLabel}>STABILITY</p>
              <p className={styles.cardValue}>{run.stability.toFixed(1)} / 5.0</p>
              <p className={styles.cardNote}>{formatSurvival(run)}</p>
            </section>
          </div>
          <section className={`${styles.card} ${styles.combinedCard}`}>
            <p className={styles.cardLabel}>COMBINED SCORE</p>
            <p className={styles.combined}>{run.combined}</p>
            <p className={styles.percentile}>{percentile}</p>
          </section>
          <ParCard puzzle={puzzle} yourScore={run.combined} />
          {fact && (
            <section className={styles.factCard} aria-label="Did you know?">
              <p className={styles.cardLabel}>DID YOU KNOW? · {fact.name.toUpperCase()}</p>
              <p className={styles.factText}>{fact.text}</p>
              {fact.source && factHost && (
                <a className={styles.factSource} href={fact.source} target="_blank" rel="noopener noreferrer">
                  Source: {factHost}
                </a>
              )}
            </section>
          )}
        </div>

        <section className={styles.leaderboard} aria-label="Today's leaderboard">
          <h2 className={styles.boardTitle}>Today&apos;s Leaderboard</h2>
          {practice ? (
            <p className={styles.boardNote}>Practice run: not submitted.</p>
          ) : !online ? (
            <>
              <ol className={styles.rows}>
                <li className={styles.row} data-self="">
                  <span className={styles.rank}>#1</span>
                  <span className={styles.name}>{playerLabel(deviceId, displayName)}</span>
                  <span className={styles.score}>{run.combined}</span>
                </li>
              </ol>
              <p className={styles.boardNote}>Offline: only your score is shown.</p>
            </>
          ) : (
            <ol className={styles.rows}>
              {rows.map(({ entry, gap }) => (
                <li
                  key={entry.playerId}
                  className={styles.row}
                  data-self={entry.playerId === deviceId ? "" : undefined}
                  data-gap={gap ? "" : undefined}
                >
                  <span className={styles.rank}>#{entry.rank}</span>
                  <span className={styles.name}>
                    {playerLabel(entry.playerId, entry.playerId === deviceId ? displayName : entry.name)}
                  </span>
                  <span className={styles.score}>{entry.combined}</span>
                </li>
              ))}
              {board && rows.length === 0 && <li className={styles.boardNote}>No scores yet.</li>}
            </ol>
          )}

          {online && !practice && (
            <button type="button" className={styles.link} onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show top 5 ↑" : "View Full Leaderboard →"}
            </button>
          )}

          {!displayName && (
            <form className={styles.nameForm} onSubmit={saveName}>
              <input
                className={styles.nameInput}
                value={nameDraft}
                maxLength={DISPLAY_NAME_MAX}
                placeholder="Add a name"
                aria-label="Display name"
                onChange={(e) => setNameDraft(e.target.value)}
              />
              <button type="submit" className={styles.nameSave} disabled={!cleanDisplayName(nameDraft) || savingName}>
                Save
              </button>
            </form>
          )}
        </section>
      </div>

      <footer className={styles.footer}>
        <p className={styles.comeBack}>Come back tomorrow for a new puzzle</p>
        <div className={styles.actions}>
          <Button disabled>Play Again (tomorrow)</Button>
          <Button variant="secondary" onClick={share}>
            {copied ? "Copied!" : "Share your result"}
          </Button>
        </div>
        <p className={styles.countdown}>
          {remainingMs === null ? " " : `Next puzzle in ${formatCountdown(remainingMs)}`}
        </p>
      </footer>
    </div>
  );
}
