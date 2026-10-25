// Supabase reads and writes for the daily game (§5.4, §6, §7). Every function
// degrades gracefully: with no Supabase configured, or on a network error, it
// returns the offline answer (generated puzzle, null standing, empty board) and
// never throws into the UI.
import { getSupabase } from "@/lib/supabase/client";
import type { DailyPuzzleRow, ScoreRow } from "@/lib/supabase/types";
import { generatePuzzle, puzzleFromRow, puzzleToRow, type DailyPuzzle } from "./puzzle";
import type { RunSummary } from "./run";

export const isOnlineMode = () => getSupabase() !== null;

export const DISPLAY_NAME_MAX = 24;

// Letters, numbers, spaces, underscores and hyphens; trimmed. null if nothing usable is left.
export function cleanDisplayName(input: string): string | null {
  const name = input
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DISPLAY_NAME_MAX);
  return name.length > 0 ? name : null;
}

export function playerLabel(playerId: string, displayName: string | null): string {
  return displayName ?? `Anonymous ${playerId.slice(0, 4).toUpperCase()}`;
}

// --- Puzzle ----------------------------------------------------------------

// The day's puzzle. The first visitor stores it in daily_puzzle; everyone after reads
// that row, so the set can't change if the materials library grows mid-day.
export async function loadPuzzle(date: string): Promise<DailyPuzzle> {
  const generated = generatePuzzle(date);
  const sb = getSupabase();
  if (!sb) return generated;

  const fetchStored = async () => {
    const { data, error } = await sb.from("daily_puzzle").select("*").eq("date", date).maybeSingle();
    return error || !data ? null : puzzleFromRow(data as DailyPuzzleRow);
  };

  const stored = await fetchStored();
  if (stored) return stored;
  await sb
    .from("daily_puzzle")
    .upsert(puzzleToRow(generated), { onConflict: "date", ignoreDuplicates: true });
  // Someone else may have stored it first; their row is the day's puzzle.
  return (await fetchStored()) ?? generated;
}

// --- Players ---------------------------------------------------------------

// Registers the device (never overwrites an existing name) and returns its display name.
export async function ensurePlayer(deviceId: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  await sb.from("players").upsert({ id: deviceId }, { onConflict: "id", ignoreDuplicates: true });
  const { data } = await sb.from("players").select("display_name").eq("id", deviceId).maybeSingle();
  return (data?.display_name as string | null | undefined) ?? null;
}

export async function saveDisplayName(deviceId: string, name: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  await sb.from("players").upsert({ id: deviceId }, { onConflict: "id", ignoreDuplicates: true });
  const { error } = await sb.from("players").update({ display_name: name }).eq("id", deviceId);
  return !error;
}

// --- Scores ----------------------------------------------------------------

// Postgres unique_violation: this device already has a score for the day, which is fine.
const UNIQUE_VIOLATION = "23505";

export async function submitScore(deviceId: string, run: RunSummary): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  await sb.from("players").upsert({ id: deviceId }, { onConflict: "id", ignoreDuplicates: true });
  const { error } = await sb.from("scores").insert({
    player_id: deviceId,
    date: run.date,
    height_score: Math.round(run.heightPercent * 100) / 100,
    stability_score: Math.round(run.stability * 100) / 100,
    combined_score: run.combined,
  });
  return !error || error.code === UNIQUE_VIOLATION;
}

export async function fetchOwnScore(deviceId: string, date: string): Promise<ScoreRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("scores")
    .select("*")
    .eq("player_id", deviceId)
    .eq("date", date)
    .maybeSingle();
  return error ? null : (data as ScoreRow | null);
}

// Number of the day's scores, optionally only those below / above a combined score. null on error.
async function countScores(date: string, compare?: { op: "lt" | "gt"; combined: number }) {
  const sb = getSupabase();
  if (!sb) return null;
  let query = sb.from("scores").select("*", { count: "exact", head: true }).eq("date", date);
  if (compare?.op === "lt") query = query.lt("combined_score", compare.combined);
  if (compare?.op === "gt") query = query.gt("combined_score", compare.combined);
  const { count, error } = await query;
  return error ? null : (count ?? 0);
}

export async function fetchPlayedCount(date: string): Promise<number | null> {
  if (!getSupabase()) return null;
  return countScores(date);
}

export interface Standing {
  // Rounded % of the day's other players this score beat; null when there are none.
  beatPercent: number | null;
  // 1-based; ties share the better rank.
  rank: number;
  total: number;
}

// §5.4: "you beat X% of today's players". includesSelf: whether `combined` is already a row
// in the table (false for practice runs, which aren't submitted).
export async function fetchStanding(
  date: string,
  combined: number,
  includesSelf: boolean,
): Promise<Standing | null> {
  if (!getSupabase()) return null;
  const [total, lower, higher] = await Promise.all([
    countScores(date),
    countScores(date, { op: "lt", combined }),
    countScores(date, { op: "gt", combined }),
  ]);
  if (total === null || lower === null || higher === null) return null;
  const others = includesSelf ? total - 1 : total;
  return {
    beatPercent: others > 0 ? Math.round((lower / others) * 100) : null,
    rank: higher + 1,
    total,
  };
}

export interface LeaderboardEntry {
  playerId: string;
  name: string | null;
  combined: number;
  rank: number;
}

export async function fetchLeaderboard(date: string, limit: number): Promise<LeaderboardEntry[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("scores")
    .select("player_id, combined_score, players(display_name)")
    .eq("date", date)
    .order("combined_score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error || !data) return [];

  // Rank by position, but tied scores share the better rank.
  let lastScore = -1;
  let lastRank = 0;
  return data.map((row, i) => {
    const combined = Number(row.combined_score);
    const rank = combined === lastScore ? lastRank : i + 1;
    lastScore = combined;
    lastRank = rank;
    const player = Array.isArray(row.players) ? row.players[0] : row.players;
    return {
      playerId: row.player_id as string,
      name: (player?.display_name as string | null | undefined) ?? null,
      combined,
      rank,
    };
  });
}
