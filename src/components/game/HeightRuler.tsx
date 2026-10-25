import { BOARD_HEIGHT_PX, PLATFORM_RECT } from "@/lib/game/board";
import type { ViewSnapshot } from "@/lib/game/boardView";
import { MAX_STACK_PX } from "@/lib/game/dailyScale";
import { HEIGHT_BANDS, type HeightBand } from "@/lib/game/scoring";
import DoomText from "./DoomText";
import styles from "./HeightRuler.module.css";

interface HeightRulerProps {
  // The official band once measured, or the live band while building.
  activeBand?: HeightBand;
  // Live tower height during the build (§8 HUD): a marker at that height.
  live?: { heightM: number; percent: number } | null;
  // The board camera: the ruler pans and zooms with the board, so its marks stay level
  // with the heights they label.
  view: ViewSnapshot;
}

// Each band's tick sits at its real lower boundary on the board (§5.1); the ruler is the
// board's height and top-aligned with it, so board px map to ruler px through the camera.
export default function HeightRuler({ activeBand, live, view }: HeightRulerProps) {
  const topFor = (percent: number) => (PLATFORM_RECT.y - (percent / 100) * MAX_STACK_PX - view.y) * view.zoom;
  // Marks panned or zoomed out of the board's strip fade out.
  const hidden = (top: number) => (top < 0 || top > BOARD_HEIGHT_PX ? "" : undefined);
  return (
    <div className={styles.ruler} aria-hidden>
      {HEIGHT_BANDS.map(({ name, minPercent }) => {
        const top = topFor(minPercent);
        return (
          <div
            key={name}
            className={styles.band}
            data-active={name === activeBand ? "" : undefined}
            data-hidden={hidden(top)}
            style={{ top }}
          >
            <span className={styles.tick} />
            <span className={styles.label}>
              <DoomText text={name} />
            </span>
          </div>
        );
      })}
      {live && (
        <div className={styles.live} data-hidden={hidden(topFor(live.percent))} style={{ top: topFor(live.percent) }}>
          <span className={styles.liveValue}>{live.heightM.toFixed(1)} m</span>
          <span className={styles.liveArrow} />
        </div>
      )}
    </div>
  );
}
