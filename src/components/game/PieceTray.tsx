"use client";

import type { PointerEvent } from "react";
import { getMaterial } from "@/data/materials";
import { localOutline, type Piece } from "@/lib/game/buildSession";
import { boundsOf } from "@/lib/game/geometry";
import { colors } from "@/lib/theme";
import PieceSvg from "./PieceSvg";
import styles from "./PieceTray.module.css";

// Tray icons are normalized to the Figma glyph size, whatever the piece's real size.
const ICON_SIZE_PX = 32;

function iconOutline(materialId: string) {
  const outline = localOutline(materialId);
  const b = boundsOf(outline);
  const scale = ICON_SIZE_PX / Math.max(b.maxX - b.minX, b.maxY - b.minY);
  return outline.map((v) => ({ x: v.x * scale, y: v.y * scale }));
}

interface PieceTrayProps {
  pieces: readonly Piece[];
  onPickUp: (uid: string, event: PointerEvent<HTMLButtonElement>) => void;
}

export default function PieceTray({ pieces, onPickUp }: PieceTrayProps) {
  return (
    <section className={styles.tray} aria-label="Piece tray">
      <p className={styles.label}>PIECE TRAY</p>
      <div className={styles.slots}>
        {pieces.map((piece) => {
          const available = piece.status === "tray";
          return (
            <button
              key={piece.uid}
              type="button"
              className={styles.slot}
              data-placed={available ? undefined : ""}
              disabled={!available}
              aria-label={getMaterial(piece.materialId).name}
              onPointerDown={(e) => available && onPickUp(piece.uid, e)}
            >
              <PieceSvg outline={iconOutline(piece.materialId)} fill={colors.ink} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
