// npm run par:merge -- <par-YYYY-MM-DD.json> [...more]: adds par files downloaded from the
// Dev Lab ("Compute par") to src/data/par.generated.json, keyed by date (a newer one replaces
// that date's entry). No network, no API calls.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LIBRARY = join(dirname(fileURLToPath(import.meta.url)), "../../src/data/par.generated.json");
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: npm run par:merge -- <par-YYYY-MM-DD.json> [...more]");
  process.exit(1);
}

const isEntry = (e) =>
  e &&
  Array.isArray(e.itemIds) &&
  typeof e.disaster === "string" &&
  Number.isFinite(e.seed) &&
  Number.isInteger(e.waitSteps) &&
  Array.isArray(e.moves) &&
  e.moves.every((m) => Number.isInteger(m.slot) && Number.isFinite(m.x) && Number.isFinite(m.angleDeg)) &&
  Number.isFinite(e.outcome?.combined);

const library = JSON.parse(readFileSync(LIBRARY, "utf8"));
for (const file of files) {
  const entries = JSON.parse(readFileSync(file, "utf8"));
  for (const [date, entry] of Object.entries(entries)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isEntry(entry)) {
      console.error(`${file}: "${date}" is not a par entry, skipped.`);
      continue;
    }
    console.log(`${date}: ${library[date] ? "replaced" : "added"} (score ${entry.outcome.combined}, ${entry.disaster})`);
    library[date] = entry;
  }
}
const sorted = Object.fromEntries(Object.entries(library).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(LIBRARY, JSON.stringify(sorted, null, 2) + "\n");
