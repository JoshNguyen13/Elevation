// 2D polygon helpers shared by drawing, hit testing and placement checks.
// Everything here is in board PIXELS (y down, angles clockwise like Matter.js).
import type { PhysicsShape } from "@/data/materials";
import { PX_PER_METER } from "@/lib/physics/constants";

export interface Vec {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Circles are approximated for drawing and overlap tests only.
const CIRCLE_SEGMENTS = 24;

function regularPolygon(sides: number, radius: number): Vec[] {
  // First vertex points straight up, matching the Figma pieces.
  return Array.from({ length: sides }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / sides;
    return { x: radius * Math.cos(a), y: radius * Math.sin(a) };
  });
}

// Area-weighted centroid — the center of mass Matter.js uses (§3.2).
function centroid(vertices: Vec[]): Vec {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}

// The shape's outline at angle 0, centered on its centroid, in px at the given
// scale. Matter bodies are built from these same vertices, so drawing and hitbox agree.
export function shapeOutline(shape: PhysicsShape, pxPerMeter = PX_PER_METER): Vec[] {
  const toPx = (meters: number) => meters * pxPerMeter;
  switch (shape.kind) {
    case "box": {
      const hw = toPx(shape.width) / 2;
      const hh = toPx(shape.height) / 2;
      return [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ];
    }
    case "circle":
      return regularPolygon(CIRCLE_SEGMENTS, toPx(shape.radius));
    case "regularPolygon":
      return regularPolygon(shape.sides, toPx(shape.radius));
    case "convex": {
      const px = shape.vertices.map((v) => ({ x: toPx(v.x), y: toPx(v.y) }));
      const c = centroid(px);
      return px.map((v) => ({ x: v.x - c.x, y: v.y - c.y }));
    }
  }
}

// Largest distance between any two vertices: the piece's end-to-end length.
export function longestDimension(outline: Vec[]): number {
  let longest = 0;
  for (const a of outline) {
    for (const b of outline) longest = Math.max(longest, Math.hypot(a.x - b.x, a.y - b.y));
  }
  return longest;
}

export function transformOutline(outline: Vec[], x: number, y: number, angle: number): Vec[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return outline.map((v) => ({ x: x + v.x * cos - v.y * sin, y: y + v.x * sin + v.y * cos }));
}

export function boundsOf(vertices: Vec[]): Bounds {
  const xs = vertices.map((v) => v.x);
  const ys = vertices.map((v) => v.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function containsPoint(polygon: Vec[], p: Vec): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross === 0) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

// Separating-axis test for two convex polygons. Shapes that only touch
// (penetration ≤ tolerance px) don't count, so pieces can sit flush.
export function overlaps(a: Vec[], b: Vec[], tolerance = 0.5): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i];
      const q = polygon[(i + 1) % polygon.length];
      const length = Math.hypot(q.x - p.x, q.y - p.y);
      const axis = { x: -(q.y - p.y) / length, y: (q.x - p.x) / length };
      const [minA, maxA] = project(a, axis);
      const [minB, maxB] = project(b, axis);
      if (Math.min(maxA, maxB) - Math.max(minA, minB) <= tolerance) return false;
    }
  }
  return true;
}

function project(polygon: Vec[], axis: Vec): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of polygon) {
    const d = v.x * axis.x + v.y * axis.y;
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return [min, max];
}
