#!/usr/bin/env node
// npm run materials:check: validates the committed library and the mock file. No network.
import { validateLibrary } from "./convert.mjs";
import { PATHS, readJson } from "./lib.mjs";

const library = readJson(PATHS.library, []);
const mock = readJson(PATHS.mock, []);
const problems = [
  ...validateLibrary(library).map((p) => `items.generated.json: ${p}`),
  ...validateLibrary(mock).map((p) => `items.mock.json: ${p}`),
];

// Mock items must never leak into the real library (or the reverse).
const realIds = new Set(library.map((item) => item.id));
for (const item of mock) {
  if (realIds.has(item.id)) problems.push(`"${item.id}" is in both items.generated.json and items.mock.json`);
}

if (problems.length > 0) {
  console.error(`\nmaterials:check FAILED:\n  ${problems.join("\n  ")}\n`);
  process.exit(1);
}
console.log(`\nmaterials:check ok: ${library.length} real item(s), ${mock.length} mock item(s).\n`);
