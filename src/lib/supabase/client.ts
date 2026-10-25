// Supabase is optional: without the env vars the game runs fully offline (local
// device ID and save, no shared leaderboard). The anon key is public by design;
// what it may do is decided by the row-level-security policies in supabase/migrations.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { USE_MOCK_ITEMS } from "@/data/materials";

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  // Fake mock items in play: stay offline so they never reach the shared database.
  if (USE_MOCK_ITEMS) return (client = null);
  // Read statically so Next can inline the NEXT_PUBLIC_ values into the bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;
  return client;
}
