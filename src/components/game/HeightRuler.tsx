import styles from "./HeightRuler.module.css";

// Height bands, top to bottom (§5.1). Static labels until height measurement lands in Phase 3.
const BANDS = ["Limitless", "Alps", "Plateau", "Mound", "Grounded"];

export default function HeightRuler() {
  return (
    <div className={styles.ruler} aria-hidden>
      {BANDS.map((band) => (
        <div key={band} className={styles.band}>
          <span className={styles.tick} />
          <span className={styles.label}>{band}</span>
        </div>
      ))}
    </div>
  );
}
