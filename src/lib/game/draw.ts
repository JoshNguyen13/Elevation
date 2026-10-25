// Custom canvas drawing for the build board (replaces Matter.Render's debug
// view, which can't match the Figma pieces). Phase 2 can feed it body vertices.
import { PLATFORM_CORNER_RADIUS_PX } from "@/lib/physics/constants";
import { colors } from "@/lib/theme";
import { BOARD_HEIGHT_PX, BOARD_WIDTH_PX, PLATFORM_RECT } from "./board";
import type { Vec } from "./geometry";

// placed: settled black piece · newest: the most recent placement (accent, as in Figma)
// preview: held piece at a valid drop spot · blocked: held piece over an invalid spot
// meteor: a disaster projectile, not a piece
export type PieceLook = "placed" | "newest" | "preview" | "blocked" | "meteor";

// A silhouette (src/data/materials.ts `icon`) and where to draw it: the body pose, the
// px-per-meter scale, and the centroid of the shape in the icon's meter frame.
export interface DrawnIcon {
  path: string;
  x: number;
  y: number;
  angle: number;
  scale: number;
  cx: number;
  cy: number;
}

export interface DrawnPiece {
  // The hitbox in board px (also what's drawn when there's no silhouette).
  outline: Vec[];
  look: PieceLook;
  icon?: DrawnIcon | null;
}

// Path2D parsing isn't free; each silhouette's path string is parsed once.
const paths = new Map<string, Path2D>();
function pathFor(d: string): Path2D {
  let path = paths.get(d);
  if (!path) {
    path = new Path2D(d);
    paths.set(d, path);
  }
  return path;
}

// Fill a silhouette in board px: translate to the body, rotate, meters -> px, centroid to origin.
function fillIcon(ctx: CanvasRenderingContext2D, icon: DrawnIcon, fill: string, edge: string | null) {
  ctx.save();
  ctx.translate(icon.x, icon.y);
  ctx.rotate(icon.angle);
  ctx.scale(icon.scale, icon.scale);
  ctx.translate(-icon.cx, -icon.cy);
  const path = pathFor(icon.path);
  ctx.fillStyle = fill;
  ctx.fill(path);
  if (edge) {
    // A hairline in the background colour keeps touching ink silhouettes apart.
    ctx.lineWidth = 1 / icon.scale;
    ctx.lineJoin = "round";
    ctx.strokeStyle = edge;
    ctx.stroke(path);
  }
  ctx.restore();
}

// Board y of the measured-height marker and of the flood's water surface.
export interface BoardOverlay {
  heightLineY: number | null;
  waterLineY: number | null;
}

function tracePolygon(ctx: CanvasRenderingContext2D, outline: Vec[]) {
  ctx.beginPath();
  outline.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)));
  ctx.closePath();
}

function drawPiece(ctx: CanvasRenderingContext2D, { outline, look, icon }: DrawnPiece) {
  if (icon) {
    if (look === "blocked") {
      // Grey silhouette + the dashed hitbox, so it reads over both black and accent pieces.
      ctx.globalAlpha = 0.75;
      fillIcon(ctx, icon, colors.tick, null);
      ctx.globalAlpha = 1;
      tracePolygon(ctx, outline);
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colors.ink;
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    ctx.globalAlpha = look === "preview" ? 0.85 : 1;
    fillIcon(
      ctx,
      icon,
      look === "placed" ? colors.ink : colors.accent,
      look === "placed" ? colors.background : null,
    );
    ctx.globalAlpha = 1;
    return;
  }

  tracePolygon(ctx, outline);
  ctx.lineJoin = "round";

  // Grey + dashed so it reads over both black and accent pieces.
  if (look === "blocked") {
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = colors.tick;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colors.ink;
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  ctx.globalAlpha = look === "preview" ? 0.85 : 1;
  ctx.fillStyle = look === "placed" ? colors.ink : look === "meteor" ? colors.textMuted : colors.accent;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = colors.inkSoft;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Expects the context already scaled for devicePixelRatio.
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  pieces: DrawnPiece[],
  { heightLineY, waterLineY }: BoardOverlay,
) {
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, BOARD_WIDTH_PX, BOARD_HEIGHT_PX);

  const { x, y, width, height } = PLATFORM_RECT;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, PLATFORM_CORNER_RADIUS_PX);
  ctx.fillStyle = colors.platform;
  ctx.fill();

  pieces.forEach((piece) => drawPiece(ctx, piece));

  // Water over the pieces, so submerged parts read as underwater.
  if (waterLineY !== null && waterLineY < BOARD_HEIGHT_PX) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = colors.accent;
    ctx.fillRect(0, waterLineY, BOARD_WIDTH_PX, BOARD_HEIGHT_PX - waterLineY);
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.accent;
    ctx.fillRect(0, waterLineY, BOARD_WIDTH_PX, 1.5);
  }

  if (heightLineY !== null) {
    ctx.beginPath();
    ctx.moveTo(0, heightLineY);
    ctx.lineTo(BOARD_WIDTH_PX, heightLineY);
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colors.accent;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
