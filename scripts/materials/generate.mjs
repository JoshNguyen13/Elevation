#!/usr/bin/env node
// Offline materials pipeline (§3.4). Grows src/data/items.generated.json with
// real-world objects: one SerpAPI image search + one Gemini estimate per NEW item.
//
//   npm run materials:plan                      what would a run do and cost? (no network, no keys)
//   npm run materials:run -- --limit 1          really call the APIs for at most 1 new item
//   npm run materials:run -- --limit 1 --dry-run   show the exact requests, send nothing
//   npm run materials:rebuild                   re-derive items from the caches (free)
//   npm run materials:mock                      fake items into src/data/items.mock.json (free)
//
// Cost rules: see CONTEXT.md and lib.mjs. In short: nothing is ever paid for twice
// (every API answer is cached on disk), a run needs an explicit --limit, and any
// API error stops the run.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toMaterial, validateEstimate, validateLibrary } from "./convert.mjs";
import { buildRequest, describeRequest, estimateObject } from "./gemini.mjs";
import {
  DEFAULT_DELAY_MS,
  DEFAULT_MODEL,
  MAX_CONSECUTIVE_INVALID,
  MAX_ITEMS_PER_RUN,
  PATHS,
  PROMPT_VERSION,
  ensureDir,
  estimateUsd,
  formatUsd,
  ledgerTotals,
  readJson,
  recordCall,
  slugify,
  sleep,
  withOneRetry,
  writeJsonAtomic,
} from "./lib.mjs";
import { mockEstimate } from "./mock.mjs";
import { downloadThumbnail, searchImage } from "./serp.mjs";

// --- Arguments -----------------------------------------------------------------

function parseArgs(argv) {
  const args = { run: false, mock: false, rebuild: false, dryRun: false, retryInvalid: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--run") args.run = true;
    else if (arg === "--mock") args.mock = true;
    else if (arg === "--rebuild") args.rebuild = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--retry-invalid") args.retryInvalid = true;
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (arg === "--only") (args.only ??= []).push(argv[++i]);
    else fail(`Unknown option: ${arg}`);
  }
  return args;
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

// --- State ---------------------------------------------------------------------

const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
const cachePath = {
  serp: (slug) => join(PATHS.serp, `${slug}.json`),
  gemini: (slug) => join(PATHS.gemini, `${slug}.json`),
  image: (slug) => join(PATHS.images, `${slug}.img`),
};

// A Gemini cache entry only counts if it's for this prompt version and model.
function geminiCache(slug) {
  const entry = readJson(cachePath.gemini(slug), null);
  return entry && entry.promptVersion === PROMPT_VERSION && entry.model === model ? entry : null;
}

function statusOf(name, library, args) {
  const slug = slugify(name);
  if (library.some((item) => item.id === slug)) return "in-library";
  const gem = geminiCache(slug);
  if (gem?.status === "ok") return "estimate-cached";
  if (gem?.status === "invalid") return args.retryInvalid ? needs(slug) : "invalid-cached";
  return needs(slug);
}

function needs(slug) {
  return existsSync(cachePath.serp(slug)) ? "needs-gemini" : "needs-both";
}

function targetNames(args) {
  const candidates = readJson(PATHS.candidates, []);
  const names = args.only ?? candidates;
  const unique = new Map();
  for (const name of names) {
    const slug = slugify(name);
    if (slug && !unique.has(slug)) unique.set(slug, name.trim());
  }
  return [...unique.values()];
}

function printLedger() {
  const t = ledgerTotals();
  console.log(
    `Lifetime real calls: ${t.serpapi} SerpAPI, ${t.gemini} Gemini ` +
      `(${t.inputTokens + t.outputTokens} tokens, est. ${formatUsd(t.estimatedUsd)} at flash-lite prices)`,
  );
}

// --- Plan (the default: no network, no keys) -------------------------------------

function plan(args) {
  const library = readJson(PATHS.library, []);
  const names = targetNames(args);
  const counts = {
    "in-library": 0,
    "estimate-cached": 0,
    "invalid-cached": 0,
    "needs-gemini": 0,
    "needs-both": 0,
  };
  for (const name of names) counts[statusOf(name, library, args)] += 1;

  console.log(`\nMaterials plan: ${names.length} candidate(s), model ${model}, prompt v${PROMPT_VERSION}`);
  console.log(`  already in the library:     ${counts["in-library"]}`);
  console.log(`  estimate cached (free):     ${counts["estimate-cached"]}  -> converted with no API call`);
  console.log(`  invalid answer cached:      ${counts["invalid-cached"]}  -> skipped (--retry-invalid to pay again)`);
  console.log(`  search cached, no estimate: ${counts["needs-gemini"]}  -> 1 Gemini call each`);
  console.log(`  nothing cached:             ${counts["needs-both"]}  -> 1 SerpAPI + 1 Gemini call each`);
  const serp = counts["needs-both"];
  const gemini = counts["needs-both"] + counts["needs-gemini"];
  console.log(`\nA full run would make ${serp} SerpAPI and ${gemini} Gemini call(s).`);
  console.log(`Nothing was sent. To spend: npm run materials:run -- --limit N   (N <= ${MAX_ITEMS_PER_RUN})`);
  console.log(`To test for free:          npm run materials:mock\n`);
  printLedger();
}

// --- Mock (free) ------------------------------------------------------------------

function runMock(args) {
  const names = targetNames(args).slice(0, args.limit ?? undefined);
  const items = names.map((name) => toMaterial(name, mockEstimate(name)));
  const problems = validateLibrary(items);
  if (problems.length) fail(`Mock items failed validation:\n  ${problems.join("\n  ")}`);
  writeJsonAtomic(PATHS.mock, items);
  console.log(`\nMock: wrote ${items.length} fake item(s) to src/data/items.mock.json. No API calls were made.`);
  console.log("See them in the game with NEXT_PUBLIC_MOCK_ITEMS=1 in .env.local (dev only; restart npm run dev).\n");
}

// --- Rebuild (free): re-derive items from the caches --------------------------------

function rebuild(args) {
  const library = readJson(PATHS.library, []);
  const names = targetNames(args);
  let updated = 0;
  let added = 0;
  for (const name of names) {
    const slug = slugify(name);
    const gem = geminiCache(slug);
    if (gem?.status !== "ok") continue;
    const item = toMaterial(name, gem.estimate);
    const at = library.findIndex((existing) => existing.id === slug);
    if (at === -1) {
      library.push(item);
      added += 1;
    } else if (JSON.stringify(library[at]) !== JSON.stringify(item)) {
      library[at] = item;
      updated += 1;
    }
  }
  finalizeLibrary(library);
  console.log(`\nRebuild from cache: ${added} added, ${updated} updated. No API calls were made.\n`);
}

function finalizeLibrary(library) {
  const problems = validateLibrary(library);
  if (problems.length) fail(`Library failed validation, NOT written:\n  ${problems.join("\n  ")}`);
  writeJsonAtomic(PATHS.library, library);
}

// --- Real run (spends API quota) ------------------------------------------------------

async function run(args) {
  if (!Number.isInteger(args.limit) || args.limit < 1) {
    fail(`--run needs an explicit --limit N (how many NEW items to pay for). Try: npm run materials:run -- --limit 1`);
  }
  if (args.limit > MAX_ITEMS_PER_RUN) {
    fail(`--limit ${args.limit} is over the safety ceiling of ${MAX_ITEMS_PER_RUN} per run (MAX_ITEMS_PER_RUN in lib.mjs).`);
  }
  const delayMs = args.delayMs ?? DEFAULT_DELAY_MS;
  const library = readJson(PATHS.library, []);
  const names = targetNames(args);

  // Free work first: cached estimates become items without any API call.
  const toPay = [];
  let fromCache = 0;
  for (const name of names) {
    const status = statusOf(name, library, args);
    if (status === "estimate-cached") {
      if (!args.dryRun) library.push(toMaterial(name, geminiCache(slugify(name)).estimate));
      fromCache += 1;
      console.log(`  cached   ${name}: ${args.dryRun ? "would be added" : "added"} from cache (no API call)`);
    } else if (status === "needs-gemini" || status === "needs-both") toPay.push({ name, status });
  }
  if (fromCache > 0 && !args.dryRun) finalizeLibrary(library);

  const batch = toPay.slice(0, args.limit);
  if (batch.length === 0) {
    console.log("\nNothing to pay for. 0 API calls made.\n");
    return printLedger();
  }
  const serpCalls = batch.filter((b) => b.status === "needs-both").length;
  console.log(`\nThis run will make up to ${serpCalls} SerpAPI and ${batch.length} Gemini call(s) for: ${batch.map((b) => b.name).join(", ")}`);

  if (args.dryRun) {
    const first = batch[0].name;
    console.log(`\n--dry-run: nothing sent. The Gemini request for "${first}" would be (key goes in an x-goog-api-key header, not shown):\n`);
    console.log(describeRequest(buildRequest(first, null)));
    return console.log("\n(the real request also attaches the reference photo if one was found)\n");
  }

  const serpKey = process.env.SERPAPI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (serpCalls > 0 && !serpKey) fail("SERPAPI_API_KEY is not set (put it in .env.local). Nothing was spent.");
  if (!geminiKey) fail("GEMINI_API_KEY is not set (put it in .env.local). Nothing was spent.");

  ensureDir(PATHS.serp);
  ensureDir(PATHS.gemini);
  ensureDir(PATHS.images);
  const spent = { serpapi: 0, gemini: 0, inputTokens: 0, outputTokens: 0 };
  let consecutiveInvalid = 0;
  let added = 0;

  try {
    for (const [index, { name }] of batch.entries()) {
      const slug = slugify(name);
      console.log(`\n[${index + 1}/${batch.length}] ${name}`);

      // 1. Reference image (SerpAPI, 1 search). Cached forever.
      let serp = readJson(cachePath.serp(slug), null);
      if (!serp) {
        serp = await withOneRetry(() => searchImage(name, serpKey));
        spent.serpapi += 1;
        recordCall({ api: "serpapi", item: slug });
        writeJsonAtomic(cachePath.serp(slug), serp);
        console.log(serp.picked ? `  serpapi  found "${serp.picked.title ?? "image"}" (${serp.picked.source ?? "?"})` : "  serpapi  no image found, Gemini will use the name alone");
        if (serp.picked) {
          const image = await downloadThumbnail(serp.picked.thumbnail);
          if (image) {
            writeFileSync(cachePath.image(slug), image.bytes);
            writeJsonAtomic(cachePath.serp(slug), { ...serp, imageMime: image.mime });
            serp = { ...serp, imageMime: image.mime };
          }
        }
        await sleep(delayMs);
      } else {
        console.log("  serpapi  cached (no call)");
      }

      // 2. Estimate (Gemini, 1 call). Cached forever, as ok or invalid.
      const image =
        serp.imageMime && existsSync(cachePath.image(slug))
          ? { mime: serp.imageMime, bytes: readFileSync(cachePath.image(slug)) }
          : null;
      const answer = await withOneRetry(() => estimateObject({ name, image, model, apiKey: geminiKey }));
      spent.gemini += 1;
      spent.inputTokens += answer.usage.inputTokens;
      spent.outputTokens += answer.usage.outputTokens;
      recordCall({ api: "gemini", item: slug, model, ...answer.usage });

      const check = answer.estimate ? validateEstimate(answer.estimate) : { ok: false, reason: answer.parseError };
      writeJsonAtomic(cachePath.gemini(slug), {
        name,
        model,
        promptVersion: PROMPT_VERSION,
        status: check.ok ? "ok" : "invalid",
        reason: check.ok ? undefined : check.reason,
        usedImage: Boolean(image),
        usage: answer.usage,
        estimate: answer.estimate,
      });

      if (!check.ok) {
        consecutiveInvalid += 1;
        console.log(`  gemini   INVALID answer (${check.reason}); cached so it won't be paid for again`);
        if (consecutiveInvalid >= MAX_CONSECUTIVE_INVALID) {
          throw new Error(`${MAX_CONSECUTIVE_INVALID} invalid answers in a row; stopping. The prompt or model probably needs attention.`);
        }
      } else {
        consecutiveInvalid = 0;
        const item = toMaterial(name, answer.estimate);
        library.push(item);
        finalizeLibrary(library);
        added += 1;
        console.log(`  gemini   ok (${answer.usage.inputTokens} in / ${answer.usage.outputTokens} out tokens)${image ? " with photo" : " name only"}`);
        console.log(`  added    ${item.id}: ${JSON.stringify(item.shape)} mass ${item.mass} friction ${item.friction}`);
      }
      if (index < batch.length - 1) await sleep(delayMs);
    }
  } catch (error) {
    console.error(`\nSTOPPED: ${error.message}`);
    console.error("Work already paid for is saved in scripts/cache/. Re-running won't repeat it.");
    process.exitCode = 1;
  }

  console.log(
    `\nThis run: ${spent.serpapi} SerpAPI + ${spent.gemini} Gemini call(s), ${added} item(s) added, ` +
      `est. Gemini cost ${formatUsd(estimateUsd(spent.inputTokens, spent.outputTokens))}.`,
  );
  printLedger();
}

// --- Main -------------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
if (args.mock) runMock(args);
else if (args.rebuild) rebuild(args);
else if (args.run) await run(args);
else plan(args);
