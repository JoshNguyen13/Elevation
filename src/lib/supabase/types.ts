// Row types for the Supabase schema (planning doc §7). The client is
// src/lib/supabase/client.ts and the SQL is supabase/migrations/0001_init.sql.

// Also the daily_puzzle check constraint (supabase/migrations/0002_disaster_types.sql).
export type DisasterType = "wind" | "earthquake" | "fat-guy" | "meteor" | "tornado" | "cat";

export type HeightBand = "Grounded" | "Mound" | "Plateau" | "Alps" | "Limitless";

export interface PlayerRow {
  id: string; // uuid — equals the anonymous device ID stored in localStorage
  display_name: string | null;
  created_at: string;
}

// unique (player_id, date) enforces one attempt per device per day.
export interface ScoreRow {
  id: string;
  player_id: string;
  date: string; // YYYY-MM-DD
  height_score: number;
  stability_score: number; // 0.0–5.0 (§5.2)
  combined_score: number; // 50/50 height + stability (§5.3)
  created_at: string;
}

export interface DailyPuzzleRow {
  date: string; // primary key, YYYY-MM-DD
  seed: string;
  item_ids: string[]; // Material ids from src/data/materials.ts
  disaster_type: DisasterType;
}
