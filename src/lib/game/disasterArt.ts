// Cartoon art for the disasters, shared by the board (disasterVisuals.ts) and the page
// backdrop (disasterBackdrop.ts). Pure drawing at a point and size; no game state.
import { colors } from "@/lib/theme";

// Disaster accents. The game is black / white / one blue; disasters get a few extra
// colors so a fireball reads as fire and a cat as a cat.
export const FX = {
  fireCore: "#ffe08a",
  fire: "#ff8a3d",
  fireDeep: "#e2462b",
  ember: "#ffb066",
  skin: "#ffd7b5",
  fur: "#f2a541",
  furDark: "#c97a1e",
  bean: "#f59fb4",
  dust: "#c9c3b8",
  leaf: "#8fb573",
  smoke: "#d6d6db",
} as const;

// The fat guy in a cannonball: a round body (the hitbox), head tucked on top, arms
// hugging his knees, accent-blue trunks. `squash` 0–1 flattens him on landing.
export function drawFatGuy(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle = 0, squash = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(1 + squash * 0.25, 1 - squash * 0.25);
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.strokeStyle = colors.ink;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Body.
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = FX.skin;
  ctx.fill();
  ctx.stroke();
  // Trunks across the lower body.
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = colors.accent;
  ctx.fillRect(-r, r * 0.25, r * 2, r * 0.5);
  ctx.restore();
  // Knees and arms wrapped around them.
  ctx.beginPath();
  ctx.arc(r * 0.25, r * 0.05, r * 0.42, Math.PI * 1.1, Math.PI * 2.05);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.75, -r * 0.1);
  ctx.quadraticCurveTo(-r * 0.1, r * 0.35, r * 0.65, -r * 0.05);
  ctx.stroke();
  // Belly button.
  ctx.beginPath();
  ctx.arc(-r * 0.35, r * 0.05, r * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = colors.ink;
  ctx.fill();
  // Head, tucked in on top.
  const hr = r * 0.48;
  ctx.beginPath();
  ctx.arc(-r * 0.15, -r * 0.72, hr, 0, Math.PI * 2);
  ctx.fillStyle = FX.skin;
  ctx.fill();
  ctx.stroke();
  // Eyes squeezed shut (> <) and a puffed-cheek grin.
  ctx.lineWidth = Math.max(1, r * 0.07);
  const ex = -r * 0.15;
  const ey = -r * 0.78;
  const e = hr * 0.22;
  ctx.beginPath();
  ctx.moveTo(ex - hr * 0.55, ey - e);
  ctx.lineTo(ex - hr * 0.3, ey);
  ctx.lineTo(ex - hr * 0.55, ey + e);
  ctx.moveTo(ex + hr * 0.55, ey - e);
  ctx.lineTo(ex + hr * 0.3, ey);
  ctx.lineTo(ex + hr * 0.55, ey + e);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ex, ey + hr * 0.35, hr * 0.25, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

// A fat guy standing up (the backdrop, far away): body, legs mid-stride, waving arms.
export function drawFatGuyStanding(ctx: CanvasRenderingContext2D, x: number, groundY: number, h: number, stride: number) {
  const r = h * 0.3;
  const cy = groundY - h * 0.38;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = Math.max(1, h * 0.035);
  // Legs.
  ctx.lineWidth = Math.max(1.5, h * 0.09);
  ctx.beginPath();
  ctx.moveTo(x - r * 0.35, cy + r * 0.7);
  ctx.lineTo(x - r * 0.35 + stride * r * 0.6, groundY);
  ctx.moveTo(x + r * 0.35, cy + r * 0.7);
  ctx.lineTo(x + r * 0.35 - stride * r * 0.6, groundY);
  ctx.stroke();
  // Arms up, waving.
  ctx.beginPath();
  ctx.moveTo(x - r * 0.85, cy - r * 0.3);
  ctx.lineTo(x - r * 1.35, cy - r * (1.1 + stride * 0.3));
  ctx.moveTo(x + r * 0.85, cy - r * 0.3);
  ctx.lineTo(x + r * 1.35, cy - r * (1.1 - stride * 0.3));
  ctx.stroke();
  ctx.lineWidth = Math.max(1, h * 0.035);
  // Body and trunks.
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = FX.skin;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = colors.accent;
  ctx.fillRect(x - r, cy + r * 0.3, r * 2, r * 0.7);
  ctx.restore();
  ctx.stroke();
  // Head and a big grin.
  const hr = r * 0.5;
  const hy = cy - r - hr * 0.6;
  ctx.beginPath();
  ctx.arc(x, hy, hr, 0, Math.PI * 2);
  ctx.fillStyle = FX.skin;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, hy + hr * 0.1, hr * 0.45, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

// A fireball: glowing core, rocky outline, and a tapering flame trail along `trail`
// (oldest first, ending at the fireball).
export function drawFireball(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  trail: readonly { x: number; y: number }[] = [],
) {
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 1; i < trail.length; i++) {
    const k = i / trail.length;
    ctx.globalAlpha = k * 0.85;
    ctx.strokeStyle = k > 0.6 ? FX.fire : FX.fireDeep;
    ctx.lineWidth = r * 1.8 * k;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 1.9);
  glow.addColorStop(0, "rgba(255, 176, 102, 0.55)");
  glow.addColorStop(1, "rgba(255, 176, 102, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
  ctx.fill();
  const core = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  core.addColorStop(0, FX.fireCore);
  core.addColorStop(0.55, FX.fire);
  core.addColorStop(1, FX.fireDeep);
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.strokeStyle = colors.inkSoft;
  ctx.stroke();
  ctx.restore();
}

// A cat paw at (x, y) with its arm reaching in from `fromX` (the board or screen edge).
// `claws` 0–1 slides the claws out (the strike).
export function drawPaw(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fromX: number, claws = 0) {
  const dir = Math.sign(x - fromX) || 1;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Arm.
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = r * 1.5 + 3;
  ctx.beginPath();
  ctx.moveTo(fromX - dir * 40, y + r * 0.5);
  ctx.lineTo(x - dir * r * 0.3, y);
  ctx.stroke();
  ctx.strokeStyle = FX.fur;
  ctx.lineWidth = r * 1.5;
  ctx.stroke();
  // Stripes on the arm.
  ctx.strokeStyle = FX.furDark;
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  for (let i = 1; i <= 3; i++) {
    const sx = x - dir * r * (0.9 + i * 0.9);
    ctx.beginPath();
    ctx.moveTo(sx, y - r * 0.55);
    ctx.lineTo(sx - dir * r * 0.25, y + r * 0.6);
    ctx.stroke();
  }
  // Claws.
  if (claws > 0) {
    ctx.fillStyle = colors.background;
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      const cy = y + i * r * 0.5;
      ctx.beginPath();
      ctx.moveTo(x + dir * r * 0.75, cy - r * 0.12);
      ctx.lineTo(x + dir * (r * 0.95 + claws * r * 0.45), cy);
      ctx.lineTo(x + dir * r * 0.75, cy + r * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  // Paw.
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = FX.fur;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.strokeStyle = colors.ink;
  ctx.stroke();
  // Toe beans and the main pad, facing the way it swats.
  ctx.fillStyle = FX.bean;
  ctx.beginPath();
  ctx.ellipse(x + dir * r * 0.05, y + r * 0.05, r * 0.36, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(x + dir * r * 0.55, y + i * r * 0.45, r * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// A tornado funnel standing on `groundY`, `h` tall, `w` wide at the top. `spin` is a
// phase in radians; `alpha` its opacity.
export function drawFunnel(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  h: number,
  w: number,
  spin: number,
  alpha: number,
  color: string = colors.textMuted,
) {
  ctx.save();
  ctx.strokeStyle = color;
  const rings = 16;
  for (let i = 0; i <= rings; i++) {
    const k = i / rings;
    const y = groundY - k * h;
    const rw = (w / 2) * (0.12 + 0.88 * k * k);
    const wobble = Math.sin(spin * 0.7 + k * 5) * w * 0.08 * k;
    ctx.globalAlpha = alpha * (0.35 + 0.65 * k);
    ctx.lineWidth = 1 + k * 2;
    ctx.beginPath();
    ctx.ellipse(x + wobble, y, rw, Math.max(1, rw * 0.18), 0, spin + k * 3, spin + k * 3 + Math.PI * 1.3);
    ctx.stroke();
  }
  ctx.restore();
}

// A round "!" warning badge.
export function drawWarning(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pulse: number) {
  ctx.save();
  ctx.globalAlpha = 0.65 + 0.35 * pulse;
  ctx.beginPath();
  ctx.arc(x, y, r * (1 + 0.15 * pulse), 0, Math.PI * 2);
  ctx.fillStyle = colors.ink;
  ctx.fill();
  ctx.fillStyle = colors.background;
  ctx.font = `700 ${Math.round(r * 1.3)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", x, y + r * 0.05);
  ctx.restore();
}
