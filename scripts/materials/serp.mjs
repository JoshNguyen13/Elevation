// SerpAPI: ONE Google Images search per item, for a reference photo that Gemini looks
// at. The photo is reference material only; it is never shown in the game (§3.4).
import { ApiError, redact } from "./lib.mjs";

const MAX_IMAGE_BYTES = 2_000_000;

// One search = one quota unit on the user's SerpAPI plan.
export async function searchImage(name, apiKey) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_images");
  url.searchParams.set("q", name);
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

  const picked = (body.images_results ?? []).find((r) => r.thumbnail);
  if (!picked) return { query: name, picked: null };
  // Text metadata only (this file is committed); no image bytes, no key.
  return {
    query: name,
    picked: {
      title: picked.title ?? null,
      source: picked.source ?? null,
      link: picked.link ?? null,
      thumbnail: picked.thumbnail,
    },
  };
}

// The thumbnail itself is a plain image URL, not a SerpAPI call, so this costs nothing.
// Failure is non-fatal: Gemini then estimates from the name alone.
export async function downloadThumbnail(thumbnailUrl) {
  try {
    const response = await fetch(thumbnailUrl);
    const mime = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!response.ok || !mime.startsWith("image/")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > 0 && bytes.length <= MAX_IMAGE_BYTES ? { mime, bytes } : null;
  } catch {
    return null;
  }
}
