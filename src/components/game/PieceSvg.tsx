import type { CSSProperties } from "react";
import { boundsOf, type Vec } from "@/lib/game/geometry";

interface PieceSvgProps {
  // Outline centered on the piece's centroid, in px.
  outline: Vec[];
  fill: string;
  className?: string;
  style?: CSSProperties;
}

// A piece as an SVG sized to its own bounds. The centroid sits at (-minX, -minY) inside it.
export default function PieceSvg({ outline, fill, className, style }: PieceSvgProps) {
  const b = boundsOf(outline);
  const width = b.maxX - b.minX;
  const height = b.maxY - b.minY;
  return (
    <svg
      className={className}
      style={style}
      width={width}
      height={height}
      viewBox={`${b.minX} ${b.minY} ${width} ${height}`}
      aria-hidden
    >
      <polygon points={outline.map((v) => `${v.x},${v.y}`).join(" ")} fill={fill} />
    </svg>
  );
}
