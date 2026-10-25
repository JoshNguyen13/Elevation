// Facts stage: ground each item in real data. ONE SerpAPI Google search ("<name> size and
// weight") keeps the answer box, knowledge panel and top snippets as text; ONE Gemini call
// reads only those and returns the side-view size, the weight and a one-line fact with its
// source. convert.mjs uses the size to correct the estimate; the fact ships to players.
import { callGemini } from "./gemini.mjs";
import { ApiError, redact } from "./lib.mjs";

// Bump to deliberately re-extract every item's facts (and pay for new Gemini calls; the
// cached searches are reused).
export const FACTS_PROMPT_VERSION = 1;

const MAX_RESULTS = 5;
const MAX_PANEL_FIELDS = 15;

// One search = one quota unit on the user's SerpAPI plan.
export async function searchFacts(name, apiKey) {
  const query = `${name} size and weight`;
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");
  url.searchParams.set("api_key", apiKey);

  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new ApiError("serpapi", 0, redact(error.message, apiKey));
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new ApiError("serpapi", response.status, redact(body.error ?? response.statusText, apiKey));
  }
  return { query, ...compactResults(body) };
}

// Text only (this is committed and sent to Gemini): no images, no tracking links, no key.
export function compactResults(body) {
  const text = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : undefined);
  const box = body.answer_box;
  const answerBox = box
    ? {
        title: text(box.title),
        answer: text(box.answer) ?? text(box.result),
        snippet: text(box.snippet),
        list: Array.isArray(box.list) ? box.list.map(text).filter(Boolean).slice(0, 8) : undefined,
        link: text(box.link),
      }
    : null;
  // The knowledge panel's facts are plain string fields ("height", "mass", ...).
  const panel = body.knowledge_graph;
  const knowledgePanel = panel
    ? Object.fromEntries(
        Object.entries(panel)
          .filter(([key, value]) => typeof value === "string" && !/link|image|thumbnail|serpapi|kgmid|^type$/i.test(key))
          .slice(0, MAX_PANEL_FIELDS)
          .map(([key, value]) => [key, text(value)]),
      )
    : null;
  const results = (body.organic_results ?? []).slice(0, MAX_RESULTS).map((r) => ({
    title: text(r.title),
    link: text(r.link),
    snippet: text(r.snippet),
  }));
  return { answerBox, knowledgePanel, results };
}

// Every link Gemini may cite as a source.
export function linksOf(search) {
  return [search.answerBox?.link, ...search.results.map((r) => r.link)].filter(Boolean);
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    side_width_m: { type: "NUMBER", nullable: true },
    side_height_m: { type: "NUMBER", nullable: true },
    weight_kg: { type: "NUMBER", nullable: true },
    fact: { type: "STRING" },
    source: { type: "STRING", nullable: true },
  },
  required: ["side_width_m", "side_height_m", "weight_kg", "fact", "source"],
};

function promptFor(name, search) {
  return [
    `Below are Google search results about a typical "${name}". Use ONLY these results, not your own knowledge.`,
    "Return JSON:",
    `- side_width_m, side_height_m: the horizontal and vertical size in metres of one typical ${name} seen from the side, resting on the ground in its natural pose. Convert units. null if the results don't state it.`,
    "- weight_kg: its typical weight in kilograms, or null if the results don't state it.",
    "- fact: one short, true, surprising fact for a game card, at most 110 characters, with a real number if possible, supported by the results. Plain text, no emoji.",
    "- source: the link of the result that best supports the numbers and the fact, copied exactly, or null.",
    "",
    "Search results:",
    JSON.stringify(search),
  ].join("\n");
}

// The exact request body, so --dry-run can show it without sending anything.
export function buildFactsRequest(name, search) {
  return {
    contents: [{ parts: [{ text: promptFor(name, search) }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 400,
      response_mime_type: "application/json",
      response_schema: SCHEMA,
    },
  };
}

export async function extractFacts({ name, search, model, apiKey }) {
  const { json, usage, parseError } = await callGemini({ model, apiKey, request: buildFactsRequest(name, search) });
  return { facts: json, usage, parseError };
}
