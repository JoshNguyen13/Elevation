// The build board in pixel space: its size and the ground platform.
import {
  CANVAS_HEIGHT_M,
  CANVAS_WIDTH_M,
  PLATFORM_BOTTOM_MARGIN_M,
  PLATFORM_HEIGHT_M,
  PLATFORM_WIDTH_M,
  toPx,
} from "@/lib/physics/constants";
import type { Vec } from "./geometry";

export const BOARD_WIDTH_PX = toPx(CANVAS_WIDTH_M);
export const BOARD_HEIGHT_PX = toPx(CANVAS_HEIGHT_M);

// Top-left corner + size, centered horizontally, PLATFORM_BOTTOM_MARGIN_M above the bottom.
const platformWidth = toPx(PLATFORM_WIDTH_M);
const platformHeight = toPx(PLATFORM_HEIGHT_M);
export const PLATFORM_RECT = {
  x: (BOARD_WIDTH_PX - platformWidth) / 2,
  y: toPx(CANVAS_HEIGHT_M - PLATFORM_BOTTOM_MARGIN_M) - platformHeight,
  width: platformWidth,
  height: platformHeight,
};

export const PLATFORM_OUTLINE: Vec[] = [
  { x: PLATFORM_RECT.x, y: PLATFORM_RECT.y },
  { x: PLATFORM_RECT.x + PLATFORM_RECT.width, y: PLATFORM_RECT.y },
  { x: PLATFORM_RECT.x + PLATFORM_RECT.width, y: PLATFORM_RECT.y + PLATFORM_RECT.height },
  { x: PLATFORM_RECT.x, y: PLATFORM_RECT.y + PLATFORM_RECT.height },
];
