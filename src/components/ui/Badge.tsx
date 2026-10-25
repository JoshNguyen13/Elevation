import type { ReactNode } from "react";
import styles from "./Badge.module.css";

// Figma Badge, Neutral tone.
export default function Badge({ children }: { children: ReactNode }) {
  return <span className={styles.badge}>{children}</span>;
}
