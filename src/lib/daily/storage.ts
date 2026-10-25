// Device identity and the one-attempt-per-day save (§7), in localStorage. Client
// only. Every access is guarded: storage can be blocked or full, and the game must
// still work (it just won't remember you).
import type { RunSummary } from "./run";

const PREFIX = "elevation:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function read(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Storage blocked: carry on without persistence.
  }
}

let memoryDeviceId: string | undefined;

// Anonymous device UUID, created on first visit. It's the players.id (§7). Clearing
// storage makes a new device, an accepted hackathon limitation.
export function getDeviceId(): string {
  const stored = read("device-id");
  if (stored && UUID.test(stored)) return stored;
  memoryDeviceId ??= crypto.randomUUID();
  write("device-id", memoryDeviceId);
  return memoryDeviceId;
}

export function getLocalDisplayName(): string | null {
  return read("display-name");
}

export function setLocalDisplayName(name: string) {
  write("display-name", name);
}

// The tutorial shows once per device (doc §8: shown to first-time players, skippable).
export function hasSeenTutorial(): boolean {
  return read("tutorial-seen") === "1";
}

export function markTutorialSeen() {
  write("tutorial-seen", "1");
}

// Dev Lab: show the tutorial again on the next Start Building.
export function resetTutorialSeen() {
  try {
    localStorage.removeItem(PREFIX + "tutorial-seen");
  } catch {
    // Storage blocked: nothing was remembered anyway.
  }
}

export interface SavedRun {
  run: RunSummary;
  // False until the score reached Supabase, so a dropped connection is retried next visit.
  submitted: boolean;
}

export function loadSavedRun(date: string): SavedRun | null {
  const raw = read(`run:${date}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedRun;
    return parsed?.run?.date === date ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRun(date: string, saved: SavedRun) {
  write(`run:${date}`, JSON.stringify(saved));
}
