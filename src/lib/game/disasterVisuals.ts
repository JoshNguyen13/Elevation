// Disaster visuals drawn on the board during the Testing Phase (disasters track).
// View only: reads the disaster's state, never changes it. Drawn in board px, over the
// pieces and under the measured-height line. Meteors themselves are drawn as pieces
// (Disaster.extraBodyUids); particles and shake live in src/lib/juice/effects.ts.
import type { Disaster } from "@/lib/physics/disasters";
import { colors } from "@/lib/theme";
import { BOARD_HEIGHT_PX, BOARD_WIDTH_PX } from "./board";

export function drawDisaster(ctx: CanvasRenderingContext2D, disaster: Disaster) {
  // Flood: water over the pieces, so submerged parts read as underwater.
  const waterLineY = disaster.waterLineY();
  if (waterLineY !== null && waterLineY < BOARD_HEIGHT_PX) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = colors.accent;
    ctx.fillRect(0, waterLineY, BOARD_WIDTH_PX, BOARD_HEIGHT_PX - waterLineY);
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.accent;
    ctx.fillRect(0, waterLineY, BOARD_WIDTH_PX, 1.5);
  }
}
