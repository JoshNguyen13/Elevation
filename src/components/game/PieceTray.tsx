"use client";

import type { PointerEvent } from "react";
import { getMaterial } from "@/data/materials";
import type { Piece } from "@/lib/game/buildSession";
import { glyph } from "@/lib/game/icon";
import { colors } from "@/lib/theme";
import DoomText from "./DoomText";
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
      <p className={styles.label}>
        <DoomText text="PIECE TRAY" />
      </p>
      <div className={styles.slots}>
        {pieces.map((piece) => {
          const available = enabled && piece.status === "tray";
          const { name } = getMaterial(piece.materialId);
          // The wrapper carries the hover name, so a placed slot's dimming doesn't fade it too.
          return (
            <div key={piece.uid} className={styles.slotWrap} data-name={name}>
              <button
                type="button"
                className={styles.slot}
                data-placed={piece.status === "tray" ? undefined : ""}
                disabled={!available}
                aria-label={name}
                onPointerDown={(e) => available && onPickUp(piece.uid, e)}
              >
                <PieceSvg {...glyph(piece.materialId)} fill={colors.ink} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
