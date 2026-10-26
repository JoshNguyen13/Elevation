// npm run par:solve -- [first-date] [days]: finds each day's par (the best tower the solver
// finds, src/lib/game/parSolver.ts) for `days` days from `first-date` (default: today, UTC, and
// 60 days) and stores it in src/data/par.generated.json, replacing that date's entry. One
// worker process per core; each day takes a few minutes. Run it again after physics or
// disaster changes: a stored par still replays, but may no longer be the best. No network.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIBRARY = join(HERE, "../../src/data/par.generated.json");
const args = process.argv.slice(2);

// Worker: solve one date and print its entry as JSON.
if (args[0] === "--one") {
  const { generatePuzzle } = await import("@/lib/daily/puzzle");
  const { solvePar } = await import("@/lib/game/parSolver");
  const entry = await solvePar(generatePuzzle(args[1]));
  process.stdout.write(JSON.stringify(entry));
  process.exit(0);
}

const first = args[0] ?? new Date().toISOString().slice(0, 10);
const days = Number(args[1] ?? 60);
if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || !Number.isInteger(days) || days < 1) {
  console.error("Usage: npm run par:solve -- [YYYY-MM-DD] [days]");
  process.exit(1);
}
const dates = Array.from({ length: days }, (_, i) => {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
});

function solve(date) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--no-warnings", "--import", join(HERE, "hooks.mjs"), fileURLToPath(import.meta.url), "--one", date]);
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(`${date}: ${chunk}`));
    child.on("close", (code) => {
      try {
        resolve(code === 0 ? JSON.parse(out) : null);
      } catch {
        resolve(null);
      }
    });
  });
}

// Saved after every day, so stopping early keeps what's done.
function store(date, entry) {
  const library = JSON.parse(readFileSync(LIBRARY, "utf8"));
  library[date] = entry;
  const sorted = Object.fromEntries(Object.entries(library).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(LIBRARY, JSON.stringify(sorted, null, 2) + "\n");
}

const workers = Math.max(1, availableParallelism() - 1);
console.log(`Solving ${dates.length} days from ${first} on ${workers} workers.`);
const started = Date.now();
let next = 0;
let done = 0;
await Promise.all(
  Array.from({ length: workers }, async () => {
    while (next < dates.length) {
      const date = dates[next++];
      const entry = await solve(date);
      done++;
      const at = `[${done}/${dates.length}, ${Math.round((Date.now() - started) / 1000)}s]`;
      if (!entry) {
        console.log(`${at} ${date}: no tower found, skipped.`);
        continue;
      }
      store(date, entry);
      const o = entry.outcome;
      console.log(`${at} ${date}: ${o.combined} (${entry.disaster}, ${o.heightM.toFixed(1)} m, ${o.collapsed ? `collapsed at ${Math.round(o.survivedS)}s` : "survived"}, ${entry.builds} builds)`);
    }
  }),
);
