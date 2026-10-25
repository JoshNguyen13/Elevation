// What one finished run looks like to the results screen, the local save and the
// leaderboard. Built from a finished BuildSession, or rebuilt from a stored score row.
import type { BuildSnapshot } from "@/lib/game/buildSession";
import { MAX_STACK_PX, pieceScale } from "@/lib/game/dailyScale";
import { bandFor, type HeightBand } from "@/lib/game/scoring";
import { MAX_TEST_DURATION_S } from "@/lib/physics/constants";
import { DISASTER_NAMES } from "@/lib/physics/disasters";
import type { ScoreRow } from "@/lib/supabase/types";
import type { DailyPuzzle } from "./puzzle";

export interface RunSummary {
  date: string;
  heightM: number;
  // 0–100, of the day's max possible height.
  heightPercent: number;
  band: HeightBand;
  // 0.0–5.0
  stability: number;
  // 0–100
  combined: number;
  survivedS: number;
  collapsed: boolean;
  disasterName: string;
}

export function runFromSnapshot(date: string, snapshot: BuildSnapshot): RunSummary | null {
  const { result, outcome } = snapshot;
  if (!result || !outcome) return null;
  return {
    date,
    heightM: result.heightM,
    heightPercent: result.percent,
    band: result.band,
    stability: outcome.stability,
    combined: outcome.combined,
    survivedS: outcome.survivedS,
    collapsed: outcome.collapsed,
    disasterName: snapshot.disasterName,
  };
}

// The score row doesn't keep meters, survival time or the collapse flag, so they're re-derived.
export function runFromScoreRow(row: ScoreRow, puzzle: DailyPuzzle): RunSummary {
  const heightPercent = Number(row.height_score);
  const stability = Number(row.stability_score);
  return {
    date: row.date,
    heightM: ((heightPercent / 100) * MAX_STACK_PX) / pieceScale(puzzle.itemIds),
    heightPercent,
    band: bandFor(heightPercent),
    stability,
    combined: Number(row.combined_score),
    survivedS: (stability / 5) * MAX_TEST_DURATION_S,
    collapsed: stability < 5,
    disasterName: DISASTER_NAMES[puzzle.disaster],
  };
}
