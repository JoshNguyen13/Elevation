// Custom canvas drawing for the build board (replaces Matter.Render's debug
// view, which can't match the Figma pieces). Phase 2 can feed it body vertices.
import { PLATFORM_CORNER_RADIUS_PX } from "@/lib/physics/constants";
import { colors } from "@/lib/theme";
import { BOARD_HEIGHT_PX, BOARD_WIDTH_PX, PLATFORM_RECT } from "./board";
import type { Vec } from "./geometry";

// placed: settled black piece · newest: the most recent placement (accent, as in Figma)
// preview: held piece at a valid drop spot · blocked: held piece over an invalid spot
export type PieceLook = "placed" | "newest" | "preview" | "blocked";

export interface DrawnPiece {
  outline: Vec[];
  look: PieceLook;
}

function tracePolygon(ctx: CanvasRenderingContext2D, outline: Vec[]) {
  ctx.beginPath();
  outline.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)));
  ctx.closePath();
}

function drawPiece(ctx: CanvasRenderingContext2D, { outline, look }: DrawnPiece) {
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
  ctx.fillStyle = look === "placed" ? colors.ink : colors.accent;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = colors.inkSoft;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Expects the context already scaled for devicePixelRatio.
export function drawBoard(ctx: CanvasRenderingContext2D, pieces: DrawnPiece[]) {
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, BOARD_WIDTH_PX, BOARD_HEIGHT_PX);

  const { x, y, width, height } = PLATFORM_RECT;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, PLATFORM_CORNER_RADIUS_PX);
  ctx.fillStyle = colors.platform;
  ctx.fill();

  pieces.forEach((piece) => drawPiece(ctx, piece));
}
