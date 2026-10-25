// The day's puzzle (§6): 10 materials + 1 disaster, a pure function of the date,
// identical for every player. It indexes into the materials library and never
// triggers a live SerpAPI / Gemini call (that's the offline pipeline, §3.4).
import { MATERIALS_POOL } from "@/data/materials";
import { DAILY_PIECE_COUNT } from "@/lib/physics/constants";
import { DISASTER_TYPES, seededRandom } from "@/lib/physics/disasters";
import type { DailyPuzzleRow, DisasterType } from "@/lib/supabase/types";

export interface DailyPuzzle {
  date: string;
  // Hex string stored in daily_puzzle.seed.
  seed: string;
  // The same seed as a number, for seededRandom().
  seedNumber: number;
  itemIds: string[];
  disaster: DisasterType;
}

// FNV-1a, 32-bit.
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const seedToString = (seedNumber: number) => seedNumber.toString(16).padStart(8, "0");

export function generatePuzzle(date: string, pool = MATERIALS_POOL): DailyPuzzle {
  const seedNumber = hashString(`elevation:${date}`);
  const rng = seededRandom(seedNumber);

  const shuffledIds = () => {
    const ids = pool.map((m) => m.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  };

  // Draw from a shuffled bag, refilling when empty, so the set is varied rather than clumped.
  const itemIds: string[] = [];
  let bag: string[] = [];
  while (itemIds.length < DAILY_PIECE_COUNT) {
    if (bag.length === 0) bag = shuffledIds();
    itemIds.push(bag.pop()!);
  }

  const disaster = DISASTER_TYPES[Math.floor(rng() * DISASTER_TYPES.length)];
  return { date, seed: seedToString(seedNumber), seedNumber, itemIds, disaster };
}

export function puzzleToRow(puzzle: DailyPuzzle): DailyPuzzleRow {
  return {
    date: puzzle.date,
    seed: puzzle.seed,
    item_ids: puzzle.itemIds,
    disaster_type: puzzle.disaster,
  };
}

// A stored row wins over regenerating, so growing the library mid-day can't change
// the day's set. Returns null if the row references anything we no longer know.
export function puzzleFromRow(row: DailyPuzzleRow, pool = MATERIALS_POOL): DailyPuzzle | null {
  const known = new Set(pool.map((m) => m.id));
  const seedNumber = parseInt(row.seed, 16);
  const valid =
    Array.isArray(row.item_ids) &&
    row.item_ids.length > 0 &&
    row.item_ids.every((id) => known.has(id)) &&
    DISASTER_TYPES.includes(row.disaster_type) &&
    Number.isFinite(seedNumber);
  if (!valid) return null;
  return {
    date: row.date,
    seed: row.seed,
    seedNumber,
    itemIds: row.item_ids,
    disaster: row.disaster_type,
  };
}
