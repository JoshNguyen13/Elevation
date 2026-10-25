"use client";

import type { PointerEvent } from "react";
import { getMaterial } from "@/data/materials";
import type { Piece } from "@/lib/game/buildSession";
import { boundsOf, type Vec } from "@/lib/game/geometry";
import { colors } from "@/lib/theme";
import PieceSvg from "./PieceSvg";
import styles from "./PieceTray.module.css";

// Tray icons are normalized to the Figma glyph size, whatever the piece's real size.
const ICON_SIZE_PX = 32;

function iconOutline(outline: Vec[]) {
  const b = boundsOf(outline);
  const scale = ICON_SIZE_PX / Math.max(b.maxX - b.minX, b.maxY - b.minY);
  return outline.map((v) => ({ x: v.x * scale, y: v.y * scale }));
}

interface PieceTrayProps {
  pieces: readonly Piece[];
  outline: (materialId: string) => Vec[];
  // False once the build is over: every slot is disabled.
  enabled: boolean;
  onPickUp: (uid: string, event: PointerEvent<HTMLButtonElement>) => void;
}

export default function PieceTray({ pieces, outline, enabled, onPickUp }: PieceTrayProps) {
  return (
    <section className={styles.tray} aria-label="Piece tray">
      <p className={styles.label}>PIECE TRAY</p>
      <div className={styles.slots}>
        {pieces.map((piece) => {
          const available = enabled && piece.status === "tray";
          return (
            <button
              key={piece.uid}
              type="button"
              className={styles.slot}
              data-placed={piece.status === "tray" ? undefined : ""}
              disabled={!available}
              aria-label={getMaterial(piece.materialId).name}
              onPointerDown={(e) => available && onPickUp(piece.uid, e)}
            >
              <PieceSvg outline={iconOutline(outline(piece.materialId))} fill={colors.ink} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
