// Disaster visuals drawn on the board during the Testing Phase (disasters track).
// View only: reads the disaster's view() snapshot, never changes it. Drawn in board px,
// over the pieces and under the measured-height line. Meteor-style bodies are also drawn
// as grey circles by draw.ts (Disaster.extraBodyUids); the art here covers them.
// Particles and shake live in src/lib/juice/effects.ts.
import type { Disaster, DisasterView } from "@/lib/physics/disasters";
import { colors } from "@/lib/theme";
import { BOARD_WIDTH_PX, PLATFORM_RECT } from "./board";
import { FX, drawFatGuy, drawFireball, drawFunnel, drawPaw, drawWarning } from "./disasterArt";

// Recent positions per fireball, for its trail. View-side history only.
const TRAIL_POINTS = 14;
const trails = new Map<string, { x: number; y: number }[]>();

// Stable pseudo-random 0–1 per index, so streaks and cracks don't flicker frame to frame.
const hash = (i: number, salt = 0) => {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function drawDisaster(ctx: CanvasRenderingContext2D, disaster: Disaster) {
  const view = disaster.view();
  const now = performance.now();
  switch (view.type) {
    case "wind":
      return drawWind(ctx, view, disaster.side, now);
    case "earthquake":
      return drawQuake(ctx, view, now);
    case "fat-guy":
      return drawFatGuys(ctx, view, now);
    case "meteor":
      return drawMeteors(ctx, view, disaster.side, now);
    case "tornado":
      return drawTornado(ctx, view, now);
    case "cat":
      return drawCat(ctx, view, disaster.side, now);
  }
}

type ViewOf<T extends DisasterView["type"]> = Extract<DisasterView, { type: T }>;

// Wind: streaks racing across the board, more and longer as it strengthens, and a few leaves.
function drawWind(ctx: CanvasRenderingContext2D, { strength, gust }: ViewOf<"wind">, side: 1 | -1, now: number) {
  const count = Math.round(8 + 34 * strength);
  const span = BOARD_WIDTH_PX + 160;
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const speed = 0.35 + 0.5 * hash(i, 1) + gust * 0.4;
    const y = 10 + hash(i, 2) * (PLATFORM_RECT.y - 10);
    const len = 18 + 50 * hash(i, 3) * (0.5 + strength);
    const travel = (now * speed + hash(i, 4) * span) % span;
    const x = side > 0 ? travel - 80 : BOARD_WIDTH_PX + 80 - travel;
    ctx.globalAlpha = 0.12 + 0.28 * strength * hash(i, 5);
    ctx.strokeStyle = colors.textMuted;
    ctx.lineWidth = 1 + hash(i, 6);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - side * len, y + Math.sin(now * 0.004 + i) * 2);
    ctx.stroke();
  }
  // Leaves tumbling downwind.
  const leaves = Math.round(2 + 8 * strength);
  for (let i = 0; i < leaves; i++) {
    const speed = 0.22 + 0.25 * hash(i, 7);
    const travel = (now * speed + hash(i, 8) * span) % span;
    const x = side > 0 ? travel - 80 : BOARD_WIDTH_PX + 80 - travel;
    const y = 30 + hash(i, 9) * (PLATFORM_RECT.y - 60) + Math.sin(now * 0.003 + i * 2) * 14;
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = FX.leaf;
    ctx.beginPath();
    ctx.ellipse(x, y, 4, 2, now * 0.01 + i, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Earthquake: cracks spreading across the platform and ripples rolling out under it.
function drawQuake(ctx: CanvasRenderingContext2D, { strength, sway }: ViewOf<"earthquake">, now: number) {
  const { x, y, width, height } = PLATFORM_RECT;
  ctx.save();
  // Ground ripples below the platform, pulsing with the sway.
  ctx.strokeStyle = colors.tick;
  for (let i = 0; i < 3; i++) {
    const k = ((now * 0.0012 + i / 3) % 1);
    ctx.globalAlpha = (1 - k) * 0.5 * strength;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x + width / 2 + sway * 6, y + height + 6, width * (0.4 + k * 0.6), 6 + k * 10, 0, Math.PI, 0, true);
    ctx.stroke();
  }
  // Cracks: more of them, and longer, as the quake grows.
  const cracks = Math.round(2 + 8 * strength);
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = colors.inkSoft;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < cracks; i++) {
    let cx = x + 10 + hash(i, 11) * (width - 20);
    let cy = y;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const segments = 2 + Math.round(3 * strength);
    for (let s = 0; s < segments; s++) {
      cx += (hash(i * 10 + s, 12) - 0.5) * 10;
      cy += (height / segments) * (0.7 + 0.3 * hash(i * 10 + s, 13));
      ctx.lineTo(cx, Math.min(cy, y + height));
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Fat guy: a landing warning (shadow + "!") before each jump, and the guy himself.
function drawFatGuys(ctx: CanvasRenderingContext2D, { guys, warning }: ViewOf<"fat-guy">, now: number) {
  if (warning) {
    const k = 1 - Math.min(1, warning.inS / 1.3);
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.02);
    ctx.save();
    ctx.globalAlpha = 0.18 + 0.3 * k;
    ctx.fillStyle = colors.ink;
    ctx.beginPath();
    ctx.ellipse(warning.x, PLATFORM_RECT.y - 2, 10 + 22 * k, 3 + 3 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(warning.x, 26);
    ctx.lineTo(warning.x, PLATFORM_RECT.y - 6);
    ctx.stroke();
    ctx.restore();
    drawWarning(ctx, warning.x, 16, 10, pulse);
  }
  for (const g of guys) {
    // Squash a little when he's stopped falling (just landed).
    const squash = Math.max(0, Math.min(1, 1 - Math.abs(g.vy) / 3)) * 0.6;
    drawFatGuy(ctx, g.x, g.y, g.radius, g.angle * 0.5, squash);
  }
}

// Meteors: an edge warning before each one, then fireballs with flame trails.
function drawMeteors(ctx: CanvasRenderingContext2D, { rocks, warning }: ViewOf<"meteor">, side: 1 | -1, now: number) {
  if (warning) {
    const edge = side > 0 ? 14 : BOARD_WIDTH_PX - 14;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.025);
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.4 * pulse;
    ctx.fillStyle = FX.fire;
    for (let i = 0; i < 3; i++) {
      const cx = edge + side * (18 + i * 10);
      ctx.beginPath();
      ctx.moveTo(cx, warning.y - 7);
      ctx.lineTo(cx + side * 7, warning.y);
      ctx.lineTo(cx, warning.y + 7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    drawWarning(ctx, edge, warning.y, 10, pulse);
  }
  const seen = new Set<string>();
  for (const rock of rocks) {
    seen.add(rock.uid);
    const trail = trails.get(rock.uid) ?? [];
    trail.push({ x: rock.x, y: rock.y });
    if (trail.length > TRAIL_POINTS) trail.shift();
    trails.set(rock.uid, trail);
    drawFireball(ctx, rock.x, rock.y, rock.radius, trail);
  }
  for (const uid of trails.keys()) if (!seen.has(uid)) trails.delete(uid);
}

// Tornado: a translucent funnel over the board at the core, with debris whirling in it.
function drawTornado(ctx: CanvasRenderingContext2D, { strength, coreX, radius }: ViewOf<"tornado">, now: number) {
  const spin = now * 0.012;
  drawFunnel(ctx, coreX, PLATFORM_RECT.y + 4, PLATFORM_RECT.y + 4, radius * 2, spin, 0.35 + 0.4 * strength);
  ctx.save();
  ctx.fillStyle = colors.textMuted;
  const debris = Math.round(6 + 14 * strength);
  for (let i = 0; i < debris; i++) {
    const k = hash(i, 21);
    const y = PLATFORM_RECT.y - k * PLATFORM_RECT.y;
    const w = radius * (0.12 + 0.88 * k * k);
    const a = spin * (1.5 + hash(i, 22)) + i;
    ctx.globalAlpha = 0.35 + 0.4 * Math.max(0, Math.sin(a));
    ctx.fillRect(coreX + Math.cos(a) * w - 1.5, y + Math.sin(a) * w * 0.18 - 1.5, 3, 3);
  }
  ctx.restore();
}

// Cat: the paw and arm, claws out on the strike, and a "!" at the edge while it winds up.
function drawCat(ctx: CanvasRenderingContext2D, { paw, stage, swatY }: ViewOf<"cat">, side: 1 | -1, now: number) {
  const edge = side > 0 ? 0 : BOARD_WIDTH_PX;
  if (stage === "windup") drawWarning(ctx, side > 0 ? 14 : BOARD_WIDTH_PX - 14, swatY - 34, 10, 0.5 + 0.5 * Math.sin(now * 0.025));
  if (!paw) return;
  if (paw.x + paw.radius < -60 || paw.x - paw.radius > BOARD_WIDTH_PX + 60) return;
  drawPaw(ctx, paw.x, paw.y, paw.radius, edge, stage === "strike" ? 1 : 0);
}
