// Gemini, icon stage: ONE call per item that draws a flat side-view silhouette as a
// single SVG path, from the cached reference photo (doc §3.4: the SerpAPI photo is the
// reference for whoever auto-generates the icon). The game renders it in ink; its convex
// hull becomes the hitbox (convert.mjs).
import { callGemini } from "./gemini.mjs";

// The prompt version written into new icon cache entries. Separate from the estimate's
// PROMPT_VERSION, so icons can be redone without re-paying for estimates.
// v1 (2026-10-25): the model wrote an endless path and hit the token cap; v2 asks for
// integer coordinates and a hard size limit; v3 asks for a level, upright outline with no
// cutouts (v2 drew a tilted brick and book, and cut a tennis ball's seam out).
export const ICON_PROMPT_VERSION = 3;
// Valid icons drawn with this version or newer are kept. Bump it (to ICON_PROMPT_VERSION)
// to deliberately redraw every icon and pay again; --redraw --only "<name>" redoes one.
export const ICON_MIN_PROMPT_VERSION = 2;

// How hard a thinking model may think per icon (thinking is billed as output). The lowest
// gemini-3.8-flash accepts: "minimal" is rejected (400), and thinkingBudget is ignored.
const ICON_THINKING_LEVEL = "low";

const SCHEMA = {
  type: "OBJECT",
  properties: { path: { type: "STRING" } },
  required: ["path"],
};

function promptFor(name, hasImage) {
  return [
    `Draw a flat, solid silhouette icon of a typical "${name}", seen from the side, resting on the ground in its natural pose.`,
    hasImage ? "A reference photo is attached; match its shape and proportions." : "",
    "Return JSON with one field, path: a single SVG path d string for a 100 x 100 viewBox (x to the right, y down).",
    "The object should fill the box as far as its proportions allow, with its lowest point touching y = 100.",
    "Draw it level and upright, as a flat side elevation: not tilted, no perspective, no 3D or top faces showing.",
    "Use only M, L, C, Q and Z commands, absolute, with WHOLE-NUMBER coordinates (no decimals). No arcs.",
    "Keep it short: at most 40 commands and under 600 characters in total. One closed outline, no holes, and no cutouts for seams, labels or surface details.",
    "Recognizability matters more than detail: include the features that make it identifiable at a glance (an elephant's trunk and ears, a giraffe's long neck, a bicycle's two wheels).",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildIconRequest(name, image, model) {
  const parts = [{ text: promptFor(name, Boolean(image)) }];
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.bytes.toString("base64") } });
  return {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0,
      // Includes "thinking" tokens on models that think; caps the worst-case cost per call.
      // 4,000 truncated 3 of 20 answers mid-thought (paid, but no path), so there's headroom.
      maxOutputTokens: 8000,
      response_mime_type: "application/json",
      response_schema: SCHEMA,
      // Full Flash models think by default, billed as output. At thinkingLevel "low",
      // gemini-3.8-flash spent 3-4k thinking tokens on a brick, and it ignored a 512-token
      // thinkingBudget (half the calls hit the 4k cap, 2026-10-25), so icons use the lowest
      // level it accepts and a roomier output cap.
      ...(model && !model.includes("flash-lite") ? { thinkingConfig: { thinkingLevel: ICON_THINKING_LEVEL } } : {}),
    },
  };
}

export async function drawIcon({ name, image, model, apiKey }) {
  const { json, usage, parseError } = await callGemini({ model, apiKey, request: buildIconRequest(name, image, model) });
  const path = typeof json?.path === "string" ? json.path.trim() : null;
  return { path, usage, parseError: path ? null : (parseError ?? "no path in answer") };
}
