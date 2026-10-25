import type { CSSProperties } from "react";
import { boundsOf, type Vec } from "@/lib/game/geometry";

interface PieceSvgProps {
  // Outline centered on the piece's centroid, in px. Sets the SVG's size and viewBox.
  outline: Vec[];
  fill: string;
  // Draw this silhouette instead of the outline polygon: an SVG path plus the transform
  // that maps it into the outline's px frame.
  art?: { path: string; transform: string };
  className?: string;
  style?: CSSProperties;
}

// A piece as an SVG sized to its own bounds. The centroid sits at (-minX, -minY) inside it.
export default function PieceSvg({ outline, fill, art, className, style }: PieceSvgProps) {
  const b = boundsOf(outline);
  const width = b.maxX - b.minX;
  const height = b.maxY - b.minY;
  return (
    <svg
      className={className}
      style={{ overflow: "visible", ...style }}
      width={width}
      height={height}
      viewBox={`${b.minX} ${b.minY} ${width} ${height}`}
      aria-hidden
    >
      {art ? (
        <path d={art.path} transform={art.transform} fill={fill} />
      ) : (
        <polygon points={outline.map((v) => `${v.x},${v.y}`).join(" ")} fill={fill} />
      )}
    </svg>
  );
}
