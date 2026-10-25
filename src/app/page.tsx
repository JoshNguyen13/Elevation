import PhysicsCanvas from "@/components/game/PhysicsCanvas";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>Elevation</h1>
        <p className={styles.phase}>Phase 0 — physics canvas</p>
      </header>
      <PhysicsCanvas />
    </main>
  );
}
