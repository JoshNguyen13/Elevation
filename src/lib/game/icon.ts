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

// What PieceSvg needs to draw a material at glyph size: its silhouette if it has one
// (sized by the silhouette's own box), otherwise its hitbox outline.
export function glyph(materialId: string): { outline: Vec[]; art?: { path: string; transform: string } } {
  const { icon } = getMaterial(materialId);
  if (!icon) return { outline: iconOutline(materialId) };
  const { x, y, w, h } = icon.box;
  const k = ICON_SIZE_PX / Math.max(w, h);
  return {
    outline: [
      { x: x * k, y: y * k },
      { x: (x + w) * k, y: y * k },
      { x: (x + w) * k, y: (y + h) * k },
      { x: x * k, y: (y + h) * k },
    ],
    art: { path: icon.path, transform: `scale(${k})` },
  };
}
