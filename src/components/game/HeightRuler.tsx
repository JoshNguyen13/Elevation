import { PLATFORM_RECT } from "@/lib/game/board";
import { MAX_STACK_PX } from "@/lib/game/dailyScale";
import { HEIGHT_BANDS, type HeightBand } from "@/lib/game/scoring";
import styles from "./HeightRuler.module.css";

// Each band's tick sits at its real lower boundary on the board (§5.1); the
// ruler is the board's height and top-aligned with it.
export default function HeightRuler({ activeBand }: { activeBand?: HeightBand }) {
  return (
    <div className={styles.ruler} aria-hidden>
      {HEIGHT_BANDS.map(({ name, minPercent }) => (
        <div
          key={name}
          className={styles.band}
          data-active={name === activeBand ? "" : undefined}
          style={{ top: PLATFORM_RECT.y - (minPercent / 100) * MAX_STACK_PX }}
        >
          <span className={styles.tick} />
          <span className={styles.label}>{name}</span>
        </div>
      ))}
    </div>
  );
}
