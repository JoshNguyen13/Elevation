import { PLATFORM_RECT } from "@/lib/game/board";
import { MAX_STACK_PX } from "@/lib/game/dailyScale";
import { HEIGHT_BANDS, type HeightBand } from "@/lib/game/scoring";
import DoomText from "./DoomText";
import styles from "./HeightRuler.module.css";

interface HeightRulerProps {
  // The official band once measured, or the live band while building.
  activeBand?: HeightBand;
  // Live tower height during the build (§8 HUD): a marker at that height.
  live?: { heightM: number; percent: number } | null;
}

const yFor = (percent: number) => PLATFORM_RECT.y - (percent / 100) * MAX_STACK_PX;

// Each band's tick sits at its real lower boundary on the board (§5.1); the
// ruler is the board's height and top-aligned with it.
export default function HeightRuler({ activeBand, live }: HeightRulerProps) {
  return (
    <div className={styles.ruler} aria-hidden>
      {HEIGHT_BANDS.map(({ name, minPercent }) => (
        <div
          key={name}
          className={styles.band}
          data-active={name === activeBand ? "" : undefined}
          style={{ top: yFor(minPercent) }}
        >
          <span className={styles.tick} />
          <span className={styles.label}>
            <DoomText text={name} />
          </span>
        </div>
      ))}
      {live && (
        <div className={styles.live} style={{ top: yFor(live.percent) }}>
          <span className={styles.liveValue}>{live.heightM.toFixed(1)} m</span>
          <span className={styles.liveArrow} />
        </div>
      )}
    </div>
  );
}
