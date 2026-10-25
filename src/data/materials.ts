// Materials schema (planning doc §3.1, §3.2, §3.4, §4.9). Basic shapes and
// pipeline-generated real-world objects share this one type — no system may
// special-case one versus the other.
import generatedItems from "./items.generated.json";

export type Archetype = "wide-stable" | "tall-narrow" | "round" | "flat-wide" | "irregular";

// Simple physics approximation in METERS — never a literal silhouette hitbox (§3.4).
export type PhysicsShape =
  | { kind: "box"; width: number; height: number }
  | { kind: "circle"; radius: number }
  | { kind: "regularPolygon"; sides: number; radius: number }
  | { kind: "convex"; vertices: { x: number; y: number }[] };

export interface Material {
  id: string;
  name: string;
  source: "basic" | "generated";
  shape: PhysicsShape;
  // Relative mass; Matter.js derives inertia from it plus the shape (§4.9).
  mass: number;
  // 0–1, Matter.js friction. The only surface property that varies (§4.9).
  // Restitution is not a field: it is fixed at 0 for every material (§3.2).
  friction: number;
  archetype?: Archetype;
  // Flat silhouette icon for the tray/canvas (§3.4, §8); unset for basic shapes.
  icon?: string;
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
    friction: 0.5,
    archetype: "wide-stable",
  },
  {
    id: "triangle",
    name: "Triangle",
    source: "basic",
    shape: { kind: "regularPolygon", sides: 3, radius: 0.85 },
    mass: 1,
    friction: 0.5,
    archetype: "irregular",
  },
  {
    id: "pentagon",
    name: "Pentagon",
    source: "basic",
    shape: { kind: "regularPolygon", sides: 5, radius: 1.1 },
    mass: 3.5,
    friction: 0.7,
    archetype: "wide-stable",
  },
];

// Output of the offline SerpAPI + Gemini pipeline (§3.4, Phase 6). Empty until it runs.
export const GENERATED_ITEMS = generatedItems as Material[];

// The pool the daily seed draws from (§3.3, §6).
export const MATERIALS_POOL: Material[] = [...BASIC_SHAPES, ...GENERATED_ITEMS];

const MATERIALS_BY_ID = new Map(MATERIALS_POOL.map((m) => [m.id, m]));

export function getMaterial(id: string): Material {
  const material = MATERIALS_BY_ID.get(id);
  if (!material) throw new Error(`Unknown material id: ${id}`);
  return material;
}
