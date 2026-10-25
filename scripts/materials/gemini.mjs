// Gemini: ONE structured-JSON estimate per item. The answer is tiny (6 numbers /
// enums), so the cost per item is a fraction of a cent. See lib.mjs for the model,
// prompt version and price constants.
import { ApiError, redact } from "./lib.mjs";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    width_m: { type: "NUMBER" },
    height_m: { type: "NUMBER" },
    archetype: {
      type: "STRING",
      enum: ["wide-stable", "tall-narrow", "round", "flat-wide", "irregular"],
    },
    taper: { type: "NUMBER" },
    density_kg_per_l: { type: "NUMBER" },
    surface_roughness: { type: "NUMBER" },
  },
  required: ["width_m", "height_m", "archetype", "taper", "density_kg_per_l", "surface_roughness"],
};

function promptFor(name, hasImage) {
  return [
    "Estimate the physical properties of a typical real-world object for a 2D stacking physics game.",
    `Object: "${name}".`,
    hasImage ? "A reference photo is attached; use it for the shape and proportions." : "",
    "Imagine it resting on the ground as it normally sits, seen from the side, at a typical size.",
    "Return JSON only:",
    "- width_m: horizontal extent in metres.",
    "- height_m: vertical extent in metres.",
    "- archetype: wide-stable, tall-narrow, round, flat-wide or irregular.",
    "- taper: top width divided by base width (1 = straight sides, about 0.1 = cone-like).",
    "- density_kg_per_l: average density of the whole object including hollow parts (water = 1).",
    "- surface_roughness: 0 = very slippery, 1 = very grippy.",
  ]
    .filter(Boolean)
    .join("\n");
}

// The exact request body, so --dry-run can show it without sending anything.
export function buildRequest(name, image) {
  const parts = [{ text: promptFor(name, Boolean(image)) }];
  if (image) {
    parts.push({ inline_data: { mime_type: image.mime, data: image.bytes.toString("base64") } });
  }
  return {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 300,
      response_mime_type: "application/json",
      response_schema: SCHEMA,
    },
  };
}

export function describeRequest(request) {
  return JSON.stringify(
    request,
    (key, value) => (key === "data" ? `<${Math.round((value.length * 3) / 4)} image bytes, base64>` : value),
    2,
  );
}

// One generateContent call with a JSON-mode request body. Returns the parsed JSON (or a
// parse error) and token usage. Shared by the estimate and icon stages.
export async function callGemini({ model, apiKey, request }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(request),
    });
  } catch (error) {
    const cause = error.cause?.code ?? error.cause?.message ?? "";
    throw new ApiError("gemini", 0, redact(`${error.message}${cause ? ` (${cause})` : ""}`, apiKey));
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError("gemini", response.status, redact(body.error?.message ?? response.statusText, apiKey));
  }

  // Thinking tokens are billed as output, so they're counted as output here.
  const usage = {
    inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: (body.usageMetadata?.candidatesTokenCount ?? 0) + (body.usageMetadata?.thoughtsTokenCount ?? 0),
  };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  try {
    return { json: JSON.parse(text), usage, parseError: null };
  } catch {
    const reason = body.candidates?.[0]?.finishReason ?? body.promptFeedback?.blockReason ?? "no JSON";
    return { json: null, usage, parseError: `unparseable answer (${reason})` };
  }
}

// One estimate call. Returns the parsed estimate and token usage.
export async function estimateObject({ name, image, model, apiKey }) {
  const { json, usage, parseError } = await callGemini({ model, apiKey, request: buildRequest(name, image) });
  return { estimate: json, usage, parseError };
}
