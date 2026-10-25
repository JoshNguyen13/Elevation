// Daily rollover (§6). Puzzles reset at midnight UTC so every player gets the
// same puzzle at the same instant. TBD §8 (UTC vs local).

// Day #1 in the "Day #N" badge.
export const LAUNCH_DATE = "2026-10-24";

const DAY_MS = 86_400_000;

// YYYY-MM-DD in UTC.
export function utcDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return utcDateString(new Date(Date.parse(date) + days * DAY_MS));
}

export function dayNumber(date: string): number {
  return Math.max(1, Math.floor((Date.parse(date) - Date.parse(LAUNCH_DATE)) / DAY_MS) + 1);
}

export function msUntilRollover(now: Date = new Date()): number {
  return Date.parse(utcDateString(now)) + DAY_MS - now.getTime();
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
