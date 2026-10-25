#!/usr/bin/env node
// Offline materials pipeline (§3.4). Grows src/data/items.generated.json with
// real-world objects. Per NEW item: one SerpAPI image search, one Gemini estimate
// (size, density, ...), one Gemini icon (a silhouette whose convex hull is the hitbox),
// and the facts stage: one SerpAPI web search + one Gemini read of it (real size, a fun fact).
//
//   npm run materials:plan                         what would a run do and cost? (no network, no keys)
//   npm run materials:run -- --limit 1             really call the APIs for at most 1 item
//   npm run materials:run -- --limit 1 --dry-run  show the exact requests, send nothing
//   add --existing to only touch items already in the library (e.g. add missing icons)
//   add --redraw --only "<name>" to pay again for one item's (valid but poor) icon
//   npm run materials:rebuild                      re-derive items from the caches (free)
//   npm run materials:mock                         fake items into src/data/items.mock.json (free)
//
// Cost rules: see CONTEXT.md and lib.mjs. Nothing is ever paid for twice (every API
// answer is cached on disk), a run needs an explicit --limit, and any API error stops it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { groundEstimate, toMaterial, validateEstimate, validateFacts, validateIcon, validateLibrary } from "./convert.mjs";
import { FACTS_PROMPT_VERSION, buildFactsRequest, extractFacts, linksOf, searchFacts } from "./facts.mjs";
import { buildRequest, describeRequest, estimateObject } from "./gemini.mjs";
import { ICON_MIN_PROMPT_VERSION, ICON_PROMPT_VERSION, buildIconRequest, drawIcon } from "./icon.mjs";
import {
  DEFAULT_DELAY_MS,
  DEFAULT_ICON_MODEL,
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
    else if (arg === "--redraw") args.redraw = true;
    else if (arg === "--existing") args.existing = true;
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (arg === "--only") (args.only ??= []).push(argv[++i]);
    else fail(`Unknown option: ${arg}`);
  }
  // Redrawing pays again for a valid icon, so it's only ever for named items.
  if (args.redraw && !args.only) fail("--redraw needs --only \"<name>\" (it pays again for a valid icon).");
  return args;
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

// --- Caches ---------------------------------------------------------------------

const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
const iconModel = process.env.GEMINI_ICON_MODEL || DEFAULT_ICON_MODEL;
const cachePath = {
  serp: (slug) => join(PATHS.serp, `${slug}.json`),
  gemini: (slug) => join(PATHS.gemini, `${slug}.json`),
  icon: (slug) => join(PATHS.icons, `${slug}.json`),
  factSearch: (slug) => join(PATHS.facts, `${slug}.search.json`),
  facts: (slug) => join(PATHS.facts, `${slug}.json`),
  image: (slug) => join(PATHS.images, `${slug}.img`),
};

// A cache entry only counts if it's for the current prompt version and model.
function estimateCache(slug) {
  const entry = readJson(cachePath.gemini(slug), null);
  return entry && entry.promptVersion === PROMPT_VERSION && entry.model === model ? entry : null;
}

// Icons from any prompt version since ICON_MIN_PROMPT_VERSION still count. A hand-drawn
// icon (model "hand-drawn", same 0-100 bottom-resting path format) always counts, so a
// run never pays to replace it; only --redraw --only "<name>" does.
function iconCache(slug) {
  const entry = readJson(cachePath.icon(slug), null);
  if (entry?.model === "hand-drawn") return entry;
  return entry && entry.promptVersion >= ICON_MIN_PROMPT_VERSION && entry.model === iconModel ? entry : null;
}

function factsCache(slug) {
  const entry = readJson(cachePath.facts(slug), null);
  return entry && entry.promptVersion === FACTS_PROMPT_VERSION && entry.model === model ? entry : null;
}

function cachedImage(slug) {
  const serp = readJson(cachePath.serp(slug), null);
  return serp?.imageMime && existsSync(cachePath.image(slug))
    ? { mime: serp.imageMime, bytes: readFileSync(cachePath.image(slug)) }
    : null;
}

// The item the caches describe right now (null if there's no valid estimate).
function itemFromCache(name) {
  const slug = slugify(name);
  const est = estimateCache(slug);
  if (est?.status !== "ok") return null;
  const icon = iconCache(slug);
  const facts = factsCache(slug);
  return toMaterial(
    name,
    est.estimate,
    icon?.status === "ok" ? icon.path : undefined,
    facts?.status === "ok" ? facts.facts : undefined,
  );
}

// What a name still needs. Paid calls are only ever for answers that aren't cached.
function needsOf(name, args) {
  const slug = slugify(name);
  const est = estimateCache(slug);
  const icon = iconCache(slug);
  if (est?.status === "invalid" && !args.retryInvalid) return { skip: "estimate invalid (cached)" };
  const estimate = est?.status !== "ok";
  const drawing = !icon || (icon.status === "invalid" && args.retryInvalid) || Boolean(args.redraw);
  const search = (estimate || drawing) && !existsSync(cachePath.serp(slug));
  const fx = factsCache(slug);
  const facts = !fx || (fx.status === "invalid" && args.retryInvalid);
  const factSearch = facts && !existsSync(cachePath.factSearch(slug));
  return { estimate, drawing, search, facts, factSearch, paid: estimate || drawing || facts };
}

// --existing: only items already in the library (e.g. to add icons without
// accidentally paying for brand-new candidates).
function targetNames(args) {
  const candidates = readJson(PATHS.candidates, []);
  const names = args.only ?? candidates;
  const inLibrary = new Set(readJson(PATHS.library, []).map((item) => item.id));
  const unique = new Map();
  for (const name of names) {
    const slug = slugify(name);
    if (!slug || unique.has(slug)) continue;
    if (args.existing && !inLibrary.has(slug)) continue;
    unique.set(slug, name.trim());
  }
  return [...unique.values()];
}

// Replace the item with this id, or append it. Returns whether anything changed.
function upsert(library, item) {
  const at = library.findIndex((existing) => existing.id === item.id);
  if (at === -1) {
    library.push(item);
    return true;
  }
  if (JSON.stringify(library[at]) === JSON.stringify(item)) return false;
  library[at] = item;
  return true;
}

function finalizeLibrary(library) {
  const problems = validateLibrary(library);
  if (problems.length) fail(`Library failed validation, NOT written:\n  ${problems.join("\n  ")}`);
  writeJsonAtomic(PATHS.library, library);
}

function printLedger() {
  const t = ledgerTotals();
  console.log(
    `Lifetime real calls: ${t.serpapi} SerpAPI, ${t.gemini} Gemini ` +
      `(${t.inputTokens + t.outputTokens} tokens, est. ${formatUsd(t.estimatedUsd)} at list prices)`,
  );
}

// --- Plan (the default: no network, no keys) -------------------------------------

function plan(args) {
  const library = readJson(PATHS.library, []);
  const names = targetNames(args);
  let complete = 0;
  let free = 0;
  let skipped = 0;
  let serp = 0;
  let estimates = 0;
  let icons = 0;
  let facts = 0;
  for (const name of names) {
    const need = needsOf(name, args);
    if (need.skip) {
      skipped += 1;
      continue;
    }
    if (need.paid) {
      serp += (need.search ? 1 : 0) + (need.factSearch ? 1 : 0);
      estimates += need.estimate ? 1 : 0;
      icons += need.drawing ? 1 : 0;
      facts += need.facts ? 1 : 0;
      continue;
    }
    const item = itemFromCache(name);
    const current = library.find((existing) => existing.id === item.id);
    if (current && JSON.stringify(current) === JSON.stringify(item)) complete += 1;
    else free += 1;
  }

  console.log(
    `\nMaterials plan: ${names.length} name(s), estimate ${model} v${PROMPT_VERSION}, ` +
      `icon ${iconModel} v${ICON_PROMPT_VERSION}, facts ${model} v${FACTS_PROMPT_VERSION}`,
  );
  console.log(`  complete (in library, up to date):  ${complete}`);
  console.log(`  everything cached (free):           ${free}  -> (re)built with no API call`);
  console.log(`  estimate invalid (cached):          ${skipped}  -> skipped (--retry-invalid to pay again)`);
  console.log(`  need paid calls:                    ${names.length - complete - free - skipped}`);
  console.log(
    `\nA full run would make ${serp} SerpAPI and ${estimates + icons + facts} Gemini call(s) ` +
      `(${estimates} estimate, ${icons} icon, ${facts} facts).`,
  );
  console.log(`Nothing was sent. To spend: npm run materials:run -- --limit N   (N <= ${MAX_ITEMS_PER_RUN} items)`);
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
  let changed = 0;
  for (const name of targetNames(args)) {
    const item = itemFromCache(name);
    if (item && upsert(library, item)) changed += 1;
  }
  finalizeLibrary(library);
  console.log(`\nRebuild from cache: ${changed} item(s) added or updated. No API calls were made.\n`);
}

// --- Real run (spends API quota) ------------------------------------------------------

async function run(args) {
  if (!Number.isInteger(args.limit) || args.limit < 1) {
    fail(`--run needs an explicit --limit N (how many items to pay for). Try: npm run materials:run -- --limit 1`);
  }
  if (args.limit > MAX_ITEMS_PER_RUN) {
    fail(`--limit ${args.limit} is over the safety ceiling of ${MAX_ITEMS_PER_RUN} per run (MAX_ITEMS_PER_RUN in lib.mjs).`);
  }
  const delayMs = args.delayMs ?? DEFAULT_DELAY_MS;
  const library = readJson(PATHS.library, []);
  const names = targetNames(args);

  // Free work first: anything fully cached is (re)built without an API call.
  const toPay = [];
  let fromCache = 0;
  for (const name of names) {
    const need = needsOf(name, args);
    if (need.skip) continue;
    if (need.paid) {
      toPay.push({ name, need });
      continue;
    }
    const item = itemFromCache(name);
    if (args.dryRun) {
      const current = library.find((existing) => existing.id === item.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(item)) fromCache += 1;
    } else if (upsert(library, item)) fromCache += 1;
  }
  if (fromCache > 0) {
    console.log(`  ${fromCache} item(s) ${args.dryRun ? "would be" : ""} (re)built from cache (no API call)`);
    if (!args.dryRun) finalizeLibrary(library);
  }

  const batch = toPay.slice(0, args.limit);
  if (batch.length === 0) {
    console.log("\nNothing to pay for. 0 API calls made.\n");
    return printLedger();
  }
  const serpCalls = batch.reduce((n, b) => n + (b.need.search ? 1 : 0) + (b.need.factSearch ? 1 : 0), 0);
  const geminiCalls = batch.reduce(
    (n, b) => n + (b.need.estimate ? 1 : 0) + (b.need.drawing ? 1 : 0) + (b.need.facts ? 1 : 0),
    0,
  );
  console.log(
    `\nThis run will make up to ${serpCalls} SerpAPI and ${geminiCalls} Gemini call(s) for: ` +
      batch.map((b) => b.name).join(", "),
  );

  if (args.dryRun) {
    const first = batch[0];
    const image = cachedImage(slugify(first.name));
    console.log(`\n--dry-run: nothing sent. Keys go in an x-goog-api-key header (not shown).`);
    if (first.need.estimate) {
      console.log(`\nEstimate request for "${first.name}":\n${describeRequest(buildRequest(first.name, image))}`);
    }
    if (first.need.drawing) {
      console.log(`\nIcon request for "${first.name}":\n${describeRequest(buildIconRequest(first.name, image, iconModel))}`);
    }
    if (first.need.factSearch) {
      console.log(`\nFacts: a SerpAPI Google search for "${first.name} size and weight", then a Gemini read of its text results.`);
    } else if (first.need.facts) {
      const search = readJson(cachePath.factSearch(slugify(first.name)), null);
      console.log(`\nFacts request for "${first.name}":\n${describeRequest(buildFactsRequest(first.name, search))}`);
    }
    return;
  }

  const serpKey = process.env.SERPAPI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (serpCalls > 0 && !serpKey) fail("SERPAPI_API_KEY is not set (put it in .env.local). Nothing was spent.");
  if (!geminiKey) fail("GEMINI_API_KEY is not set (put it in .env.local). Nothing was spent.");

  for (const dir of [PATHS.serp, PATHS.gemini, PATHS.icons, PATHS.facts, PATHS.images]) ensureDir(dir);
  const spent = { serpapi: 0, gemini: 0, usd: 0 };
  let consecutiveInvalid = 0;
  let done = 0;
  const pause = () => sleep(delayMs);
  const spend = (usage, usedModel) => {
    spent.gemini += 1;
    spent.usd += estimateUsd(usage.inputTokens, usage.outputTokens, usedModel);
  };
  const invalid = (what, reason) => {
    consecutiveInvalid += 1;
    console.log(`  ${what.padEnd(8)} INVALID answer (${reason}); cached so it won't be paid for again`);
    if (consecutiveInvalid >= MAX_CONSECUTIVE_INVALID) {
      throw new Error(`${MAX_CONSECUTIVE_INVALID} invalid answers in a row; stopping. The prompt or model probably needs attention.`);
    }
  };

  try {
    for (const [index, { name, need }] of batch.entries()) {
      const slug = slugify(name);
      console.log(`\n[${index + 1}/${batch.length}] ${name}`);

      // 1. Reference photo (SerpAPI, 1 search). Cached forever.
      if (need.search) {
        let serp = await withOneRetry(() => searchImage(name, serpKey));
        spent.serpapi += 1;
        recordCall({ api: "serpapi", item: slug });
        writeJsonAtomic(cachePath.serp(slug), serp);
        console.log(serp.picked ? `  serpapi  found "${serp.picked.title ?? "image"}" (${serp.picked.source ?? "?"})` : "  serpapi  no image found, Gemini will use the name alone");
        if (serp.picked) {
          const image = await downloadThumbnail(serp.picked.thumbnail);
          if (image) {
            writeFileSync(cachePath.image(slug), image.bytes);
            serp = { ...serp, imageMime: image.mime };
            writeJsonAtomic(cachePath.serp(slug), serp);
          }
        }
        await pause();
      }
      const image = cachedImage(slug);

      // 2. Estimate (Gemini, 1 call). Cached forever, as ok or invalid.
      if (need.estimate) {
        const answer = await withOneRetry(() => estimateObject({ name, image, model, apiKey: geminiKey }));
        spend(answer.usage, model);
        recordCall({ api: "gemini", stage: "estimate", item: slug, model, ...answer.usage });
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
          invalid("estimate", check.reason);
          if (index < batch.length - 1) await pause();
          continue; // no point drawing an icon for an item we can't build
        }
        console.log(`  estimate ok (${answer.usage.inputTokens} in / ${answer.usage.outputTokens} out tokens)${image ? " with photo" : " name only"}`);
        await pause();
      }

      // 3. Icon (Gemini, 1 call): a silhouette, whose hull becomes the hitbox. Cached forever.
      if (need.drawing) {
        const answer = await withOneRetry(() => drawIcon({ name, image, model: iconModel, apiKey: geminiKey }));
        spend(answer.usage, iconModel);
        recordCall({ api: "gemini", stage: "icon", item: slug, model: iconModel, ...answer.usage });
        const check = answer.path ? validateIcon(answer.path) : { ok: false, reason: answer.parseError };
        writeJsonAtomic(cachePath.icon(slug), {
          name,
          model: iconModel,
          promptVersion: ICON_PROMPT_VERSION,
          status: check.ok ? "ok" : "invalid",
          reason: check.ok ? undefined : check.reason,
          usedImage: Boolean(image),
          usage: answer.usage,
          path: answer.path,
        });
        if (check.ok) {
          console.log(`  icon     ok (${answer.usage.inputTokens} in / ${answer.usage.outputTokens} out tokens, ${answer.path.length} chars)`);
        } else {
          invalid("icon", check.reason); // the item is still built, with the plain shape
        }
        if (need.facts) await pause();
      }

      // 4. Facts: a web search (SerpAPI, 1 search), then Gemini reads only its text
      //    results (1 call) for the real size and a fun fact. Both cached forever.
      if (need.factSearch) {
        const search = await withOneRetry(() => searchFacts(name, serpKey));
        spent.serpapi += 1;
        recordCall({ api: "serpapi", stage: "facts", item: slug });
        writeJsonAtomic(cachePath.factSearch(slug), search);
        const extras = [search.answerBox && "answer box", search.knowledgePanel && "knowledge panel"].filter(Boolean);
        console.log(`  search   ${search.results.length} result(s)${extras.length ? `, ${extras.join(", ")}` : ""}`);
        await pause();
      }
      if (need.facts) {
        const search = readJson(cachePath.factSearch(slug), null);
        const answer = await withOneRetry(() => extractFacts({ name, search, model, apiKey: geminiKey }));
        spend(answer.usage, model);
        recordCall({ api: "gemini", stage: "facts", item: slug, model, ...answer.usage });
        const check = answer.facts ? validateFacts(answer.facts, linksOf(search)) : { ok: false, reason: answer.parseError };
        writeJsonAtomic(cachePath.facts(slug), {
          name,
          model,
          promptVersion: FACTS_PROMPT_VERSION,
          status: check.ok ? "ok" : "invalid",
          reason: check.ok ? undefined : check.reason,
          usage: answer.usage,
          facts: check.ok ? check.facts : answer.facts,
        });
        if (check.ok) {
          const est = estimateCache(slug);
          console.log(`  facts    "${check.facts.fact}"`);
          if (est?.status === "ok") console.log(`           ${groundEstimate(est.estimate, check.facts).note}`);
        } else {
          invalid("facts", check.reason); // the item is still built, from the estimate alone
        }
      }

      // 5. Build the item from the caches and save it straight away.
      const item = itemFromCache(name);
      if (item) {
        upsert(library, item);
        finalizeLibrary(library);
        done += 1;
        const failed =
          (need.drawing && iconCache(slug)?.status !== "ok") || (need.facts && factsCache(slug)?.status !== "ok");
        if (!failed) consecutiveInvalid = 0;
        console.log(`  saved    ${item.id}: ${item.shape.kind}${item.shape.vertices ? ` (${item.shape.vertices.length} pts)` : ""}, mass ${item.mass}, friction ${item.friction}${item.icon ? ", with silhouette" : ""}`);
      }
      if (index < batch.length - 1) await pause();
    }
  } catch (error) {
    console.error(`\nSTOPPED: ${error.message}`);
    console.error("Work already paid for is saved in scripts/cache/. Re-running won't repeat it.");
    process.exitCode = 1;
  }

  console.log(
    `\nThis run: ${spent.serpapi} SerpAPI + ${spent.gemini} Gemini call(s), ${done} item(s) saved, ` +
      `est. Gemini cost ${formatUsd(spent.usd)}.`,
  );
  printLedger();
}

// --- Main -------------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
if (args.mock) runMock(args);
else if (args.rebuild) rebuild(args);
else if (args.run) await run(args);
else plan(args);
