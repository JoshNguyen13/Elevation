// Per-day piece scale (§5.1). The board is fixed; each day's set is scaled as a
// whole, keeping real-world proportions, so all its pieces laid end to end (by
// longest dimension) reach exactly MAX_STACK_PX above the platform.
import { getMaterial } from "@/data/materials";
import { HEIGHT_HEADROOM } from "@/lib/physics/constants";
import { PLATFORM_RECT } from "./board";
import { longestDimension, shapeOutline } from "./geometry";

// The day's max possible height in board px: 100% for height banding.
export const MAX_STACK_PX = HEIGHT_HEADROOM * PLATFORM_RECT.y;

// Board px per real-world meter for this set of pieces.
export function pieceScale(materialIds: readonly string[]): number {
  const totalM = materialIds.reduce(
    (sum, id) => sum + longestDimension(shapeOutline(getMaterial(id).shape, 1)),
    0,
  );
  return MAX_STACK_PX / totalM;
}
