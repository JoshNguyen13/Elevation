// Shared helpers for the offline materials pipeline. Plain Node, no dependencies.
// This folder must never import from src/ (the deployed game must not depend on it).
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "..", "..");
const cache = join(ROOT, "scripts", "cache");

export const PATHS = {
  candidates: join(here, "candidates.json"),
  serp: join(cache, "serpapi"),
  gemini: join(cache, "gemini"),
  // Thumbnail bytes: git-ignored (web images are not ours to commit).
  images: join(cache, "images"),
  ledger: join(cache, "ledger.jsonl"),
  library: join(ROOT, "src", "data", "items.generated.json"),
  mock: join(ROOT, "src", "data", "items.mock.json"),
};

// --- Cost guards. Edit here, nowhere else. ---------------------------------

// Most items one --run may process. Raising it is a deliberate edit.
export const MAX_ITEMS_PER_RUN = 25;
// Pause between paid calls (SerpAPI free plan: 50 searches/hour; Gemini free tier has rate limits).
export const DEFAULT_DELAY_MS = 4000;
// Stop the run after this many Gemini answers in a row fail validation: the prompt is probably broken.
export const MAX_CONSECUTIVE_INVALID = 3;
// Bump to deliberately invalidate every cached Gemini estimate (and pay for new ones).
export const PROMPT_VERSION = 1;
// gemini-2.5-flash-lite is cheaper but "no longer available to new users" (the 1-item canary
// got a 404 on 2026-10-25), so the default is the next-cheapest Flash-Lite that works.
export const DEFAULT_MODEL = "gemini-3.1-flash-lite";
// USD per 1M tokens, for the cost ESTIMATE only (gemini-3.1-flash-lite list price, checked 2026-10-24).
export const PRICE_PER_M_TOKENS = { input: 0.25, output: 1.5 };

// --- Files -------------------------------------------------------------------

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

export function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

// Write-then-rename, so a crash never leaves a half-written (and already paid for) file.
export function writeJsonAtomic(path, data) {
  ensureDir(dirname(path));
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, path);
}

export function slugify(name) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Errors and retries --------------------------------------------------------

export class ApiError extends Error {
  constructor(api, status, message) {
    super(`${api} ${status}: ${message}`);
    this.api = api;
    this.status = status;
  }
}

// Keys must never reach logs or files, even inside an error message.
export function redact(text, ...secrets) {
  let out = String(text);
  for (const secret of secrets) if (secret) out = out.split(secret).join("***");
  return out;
}

// One retry, only for rate limits and server errors. Everything else fails at once.
// Also Gemini 403 "caller does not have permission": observed 2026-10-25 as an
// intermittent error (the identical request succeeded on the next try). Rejected
// requests aren't billed, so one retry after a longer pause is safe; a second 403 stops the run.
export async function withOneRetry(fn) {
  try {
    return await fn();
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const transient403 = error.api === "gemini" && error.status === 403;
    const retryable = error.status === 429 || error.status >= 500 || transient403;
    if (!retryable) throw error;
    await sleep(transient403 ? 15000 : 5000);
    return fn();
  }
}

// --- Ledger: every real (paid or quota-using) call, never keys or responses ------

export function recordCall(entry) {
  ensureDir(dirname(PATHS.ledger));
  appendFileSync(PATHS.ledger, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
}

export function ledgerTotals() {
  const totals = { serpapi: 0, gemini: 0, inputTokens: 0, outputTokens: 0 };
  if (!existsSync(PATHS.ledger)) return { ...totals, estimatedUsd: 0 };
  for (const line of readFileSync(PATHS.ledger, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    if (entry.api === "serpapi") totals.serpapi += 1;
    if (entry.api === "gemini") {
      totals.gemini += 1;
      totals.inputTokens += entry.inputTokens ?? 0;
      totals.outputTokens += entry.outputTokens ?? 0;
    }
  }
  return { ...totals, estimatedUsd: estimateUsd(totals.inputTokens, totals.outputTokens) };
}

export function estimateUsd(inputTokens, outputTokens) {
  return (
    (inputTokens * PRICE_PER_M_TOKENS.input + outputTokens * PRICE_PER_M_TOKENS.output) / 1_000_000
  );
}

export function formatUsd(usd) {
  if (usd === 0) return "$0.00";
  return usd < 0.01 ? `under $0.01 (~$${usd.toFixed(5)})` : `$${usd.toFixed(2)}`;
}
