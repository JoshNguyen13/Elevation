// Minimal SVG path toolkit for item silhouettes. Pure: no I/O.
// parse (absolute + relative M L H V C S Q T Z; arcs rejected) → normalized absolute
// segments → flattened points → convex hull → simplified hull. Also re-serializes a
// transformed path, so the game gets the art in the same meter frame as the hitbox.

const ALLOWED = /^[MmLlHhVvCcSsQqTtZz0-9.,\-+eE\s]+$/;
const PARAMS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, z: 0 };
export const MAX_PATH_CHARS = 4000;
const MAX_COMMANDS = 400;

// Absolute segments: M/L {p}, C {c1, c2, p}, Q {c, p}, Z.
// maxChars: the raw Gemini answer is capped at MAX_PATH_CHARS; re-serialized meter-frame paths are longer.
export function parsePath(d, maxChars = MAX_PATH_CHARS) {
  if (typeof d !== "string" || d.length === 0) throw new Error("empty path");
  if (d.length > maxChars) throw new Error(`path too long (${d.length} chars)`);
  if (!ALLOWED.test(d)) throw new Error("path has characters other than M L H V C S Q T Z and numbers");
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];

  const segments = [];
  let i = 0;
  let cmd = null;
  let cur = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let lastCubic = null; // last C control point, for S
  let lastQuad = null; // last Q control point, for T
  const num = () => {
    const t = tokens[i++];
    const n = Number(t);
    if (t === undefined || !Number.isFinite(n)) throw new Error("bad number in path");
    return n;
  };

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    else if (cmd === null) throw new Error("path must start with a command");
    else if (cmd === "M") cmd = "L"; // implicit lineto after moveto
    else if (cmd === "m") cmd = "l";
    const lower = cmd.toLowerCase();
    if (!(lower in PARAMS)) throw new Error(`unsupported command ${cmd}`);
    if (segments.length > MAX_COMMANDS) throw new Error("too many commands");
    const rel = cmd === lower && lower !== "z";
    const pt = (x, y) => (rel ? { x: cur.x + x, y: cur.y + y } : { x, y });

    switch (lower) {
      case "m": {
        const p = pt(num(), num());
        segments.push({ type: "M", p });
        cur = start = p;
        lastCubic = lastQuad = null;
        break;
      }
      case "l": {
        const p = pt(num(), num());
        segments.push({ type: "L", p });
        cur = p;
        lastCubic = lastQuad = null;
        break;
      }
      case "h": {
        const x = num();
        const p = { x: rel ? cur.x + x : x, y: cur.y };
        segments.push({ type: "L", p });
        cur = p;
        lastCubic = lastQuad = null;
        break;
      }
      case "v": {
        const y = num();
        const p = { x: cur.x, y: rel ? cur.y + y : y };
        segments.push({ type: "L", p });
        cur = p;
        lastCubic = lastQuad = null;
        break;
      }
      case "c": {
        const c1 = pt(num(), num());
        const c2 = pt(num(), num());
        const p = pt(num(), num());
        segments.push({ type: "C", c1, c2, p });
        cur = p;
        lastCubic = c2;
        lastQuad = null;
        break;
      }
      case "s": {
        const c1 = lastCubic ? { x: 2 * cur.x - lastCubic.x, y: 2 * cur.y - lastCubic.y } : cur;
        const c2 = pt(num(), num());
        const p = pt(num(), num());
        segments.push({ type: "C", c1, c2, p });
        cur = p;
        lastCubic = c2;
        lastQuad = null;
        break;
      }
      case "q": {
        const c = pt(num(), num());
        const p = pt(num(), num());
        segments.push({ type: "Q", c, p });
        cur = p;
        lastQuad = c;
        lastCubic = null;
        break;
      }
      case "t": {
        const c = lastQuad ? { x: 2 * cur.x - lastQuad.x, y: 2 * cur.y - lastQuad.y } : cur;
        const p = pt(num(), num());
        segments.push({ type: "Q", c, p });
        cur = p;
        lastQuad = c;
        lastCubic = null;
        break;
      }
      case "z": {
        segments.push({ type: "Z" });
        cur = start;
        lastCubic = lastQuad = null;
        break;
      }
    }
  }
  if (segments.length === 0 || segments[0].type !== "M") throw new Error("path must start with M");
  return segments;
}

// Points along the path (curves sampled), for the bbox and the hull.
export function flatten(segments, steps = 12) {
  const points = [];
  let cur = { x: 0, y: 0 };
  for (const s of segments) {
    if (s.type === "M" || s.type === "L") {
      points.push(s.p);
      cur = s.p;
    } else if (s.type === "C") {
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const u = 1 - t;
        points.push({
          x: u * u * u * cur.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.p.x,
          y: u * u * u * cur.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.p.y,
        });
      }
      cur = s.p;
    } else if (s.type === "Q") {
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const u = 1 - t;
        points.push({
          x: u * u * cur.x + 2 * u * t * s.c.x + t * t * s.p.x,
          y: u * u * cur.y + 2 * u * t * s.c.y + t * t * s.p.y,
        });
      }
      cur = s.p;
    }
  }
  return points;
}

export function bounds(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

// Andrew's monotone chain. Returns the hull without collinear points.
export function convexHull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Drop the vertex whose removal loses the least area until at most `max` remain.
// Removing a vertex from a convex polygon keeps it convex.
export function simplifyHull(hull, max) {
  const out = [...hull];
  while (out.length > max) {
    let best = 0;
    let bestArea = Infinity;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      const area = Math.abs(cross(a, b, c)) / 2;
      if (area < bestArea) {
        bestArea = area;
        best = i;
      }
    }
    out.splice(best, 1);
  }
  return out;
}

export function polygonArea(vertices) {
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// Whether p is inside (or on) a convex polygon, with a small tolerance.
export function insideConvex(vertices, p, tolerance = 1e-6) {
  let sign = 0;
  for (let i = 0; i < vertices.length; i++) {
    const c = cross(vertices[i], vertices[(i + 1) % vertices.length], p);
    if (Math.abs(c) <= tolerance) continue;
    const s = Math.sign(c);
    if (sign !== 0 && s !== sign) return false;
    sign = s;
  }
  return true;
}

// Apply p -> (p - origin) * scale to every point and serialize as absolute M/L/C/Q/Z.
export function transformPath(segments, origin, scale, digits = 4) {
  const f = (v) => Number(v.toFixed(digits)).toString();
  const t = (p) => `${f((p.x - origin.x) * scale)} ${f((p.y - origin.y) * scale)}`;
  return segments
    .map((s) => {
      if (s.type === "M" || s.type === "L") return `${s.type}${t(s.p)}`;
      if (s.type === "C") return `C${t(s.c1)} ${t(s.c2)} ${t(s.p)}`;
      if (s.type === "Q") return `Q${t(s.c)} ${t(s.p)}`;
      return "Z";
    })
    .join("");
}
