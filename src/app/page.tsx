import BuildPhase from "@/components/game/BuildPhase";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <BuildPhase />
    </main>
  );
}
