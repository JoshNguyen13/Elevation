// Materials schema (planning doc §3.1, §3.2, §3.4, §4.9). Basic shapes and
// pipeline-generated real-world objects share this one type — no system may
// special-case one versus the other.
import generatedItems from "./items.generated.json";
import mockItems from "./items.mock.json";

export type Archetype = "wide-stable" | "tall-narrow" | "round" | "flat-wide" | "irregular";

// Simple physics approximation in METERS — never a literal silhouette hitbox (§3.4).
export type PhysicsShape =
  | { kind: "box"; width: number; height: number }
  | { kind: "circle"; radius: number }
  | { kind: "regularPolygon"; sides: number; radius: number }
  | { kind: "convex"; vertices: { x: number; y: number }[] };

export interface MaterialIcon {
  path: string;
  box: { x: number; y: number; w: number; h: number };
}

export interface Material {
  id: string;
  name: string;
  source: "basic" | "generated";
  shape: PhysicsShape;
  // Relative mass; Matter.js derives inertia from it plus the shape (§4.9).
  mass: number;
  // Matter.js friction; ~0.5 is slippery, 1+ grips hard. The only surface property that varies (§4.9).
  // Restitution is not a field: it is fixed at 0 for every material (§3.2).
  friction: number;
  archetype?: Archetype;
  // Flat silhouette (§3.4, §8), drawn instead of the hitbox; unset for basic shapes.
  // `path` is an SVG path (absolute M L C Q Z only) in METERS, in the same frame as
  // `shape` (convex vertices / the circle's centre); `box` is its bounding box.
  icon?: MaterialIcon;
}

// TBD §3.1 — placeholder numbers. Sizes are real-world meters; only their
// proportions matter, since each day's set is scaled to fit (dailyScale.ts).
export const BASIC_SHAPES: Material[] = [
  {
    id: "square",
    name: "Square",
    source: "basic",
    shape: { kind: "box", width: 1.8, height: 1.8 },
    mass: 2,
    friction: 1,
    archetype: "wide-stable",
  },
  {
    id: "triangle",
    name: "Triangle",
    source: "basic",
    shape: { kind: "regularPolygon", sides: 3, radius: 0.85 },
    mass: 1,
    friction: 1,
    archetype: "irregular",
  },
  {
    id: "pentagon",
    name: "Pentagon",
    source: "basic",
    shape: { kind: "regularPolygon", sides: 5, radius: 1.1 },
    mass: 3.5,
    friction: 1.3,
    archetype: "wide-stable",
  },
];

// Output of the offline SerpAPI + Gemini pipeline (§3.4, Phase 6). Empty until it runs.
export const GENERATED_ITEMS = generatedItems as Material[];

// Dev-only: the FAKE items from `npm run materials:mock`, for testing without API calls.
// Never in production. src/lib/supabase/client.ts also goes offline when this is on, so
// puzzles and scores built from fake items can't reach the shared database.
export const USE_MOCK_ITEMS =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_MOCK_ITEMS === "1";

// The pool the daily seed draws from (§3.3, §6).
export const MATERIALS_POOL: Material[] = [
  ...BASIC_SHAPES,
  ...GENERATED_ITEMS,
  ...(USE_MOCK_ITEMS ? (mockItems as Material[]) : []),
];

const MATERIALS_BY_ID = new Map(MATERIALS_POOL.map((m) => [m.id, m]));

export function getMaterial(id: string): Material {
  const material = MATERIALS_BY_ID.get(id);
  if (!material) throw new Error(`Unknown material id: ${id}`);
  return material;
}
