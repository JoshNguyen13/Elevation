"use client";

import type { PointerEvent } from "react";
import { getMaterial } from "@/data/materials";
import type { Piece } from "@/lib/game/buildSession";
import { iconOutline } from "@/lib/game/icon";
import { colors } from "@/lib/theme";
import PieceSvg from "./PieceSvg";
import styles from "./PieceTray.module.css";

interface PieceTrayProps {
  pieces: readonly Piece[];
  // False once the build is over: every slot is disabled.
  enabled: boolean;
  onPickUp: (uid: string, event: PointerEvent<HTMLButtonElement>) => void;
}

export default function PieceTray({ pieces, enabled, onPickUp }: PieceTrayProps) {
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
              <PieceSvg outline={iconOutline(piece.materialId)} fill={colors.ink} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
