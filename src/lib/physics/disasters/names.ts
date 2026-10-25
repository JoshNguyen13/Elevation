import type { DisasterType } from "@/lib/supabase/types";

export const DISASTER_TYPES: readonly DisasterType[] = ["wind", "earthquake", "fat-guy", "meteor", "tornado", "cat"];

export const DISASTER_NAMES: Record<DisasterType, string> = {
  wind: "High Wind",
  earthquake: "Earthquake",
  "fat-guy": "Big Ol' Fat Guy",
  meteor: "Meteor Shower",
  tornado: "Tornado",
  cat: "Giant Cat",
};
