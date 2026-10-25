import { getMaterial } from "@/data/materials";
import { boundsOf, shapeOutline, type Vec } from "./geometry";

// Tray / intro icons are normalized to the Figma glyph size, whatever the piece's real size.
const ICON_SIZE_PX = 32;

export function iconOutline(materialId: string): Vec[] {
  const outline = shapeOutline(getMaterial(materialId).shape, 1);
  const b = boundsOf(outline);
  const scale = ICON_SIZE_PX / Math.max(b.maxX - b.minX, b.maxY - b.minY);
  return outline.map((v) => ({ x: v.x * scale, y: v.y * scale }));
}
