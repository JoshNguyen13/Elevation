import styles from "./StabilityMeter.module.css";

// Figma "03 — Testing Phase" Stability Meter: the share of the tower still standing.
export default function StabilityMeter({ integrity }: { integrity: number }) {
  const percent = Math.round(integrity * 100);
  return (
    <section className={styles.meter} aria-label="Stability">
      <p className={styles.label}>Stability: {percent}%</p>
      <div
        className={styles.track}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
      <p className={styles.caption}>Disaster gets stronger the longer you survive.</p>
    </section>
  );
}
