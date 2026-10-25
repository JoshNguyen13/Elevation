import Button from "@/components/ui/Button";
import styles from "./TutorialScreen.module.css";

// Figma "01 — Tutorial". Copy from the Figma step cards.
const STEPS = [
  { title: "Drag to place", body: "Drag any shape from the tray onto the platform, anywhere you like." },
  { title: "Rotate with Q / E", body: "Spin a piece before you drop it to get the angle just right." },
  { title: "Stack in 2 minutes", body: "Place all 10 pieces before the build timer runs out." },
  { title: "Survive the disaster", body: "When time's up, your tower faces a random test. Outlast it for points." },
];

interface TutorialScreenProps {
  // Both "Skip" and the main button finish the tutorial.
  onDone: () => void;
  ctaLabel: string;
}

export default function TutorialScreen({ onDone, ctaLabel }: TutorialScreenProps) {
  return (
    <div className={styles.screen}>
      <header className={styles.topBar}>
        <h1 className={styles.title}>How to Play</h1>
        <button type="button" className={styles.skip} onClick={onDone}>
          Skip →
        </button>
      </header>

      <ol className={styles.steps}>
        {STEPS.map((step, i) => (
          <li key={step.title} className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.number}>{i + 1}</span>
              <p className={styles.cardTitle}>{step.title}</p>
            </div>
            <p className={styles.cardBody}>{step.body}</p>
          </li>
        ))}
      </ol>

      <footer className={styles.footer}>
        <Button onClick={onDone}>{ctaLabel}</Button>
      </footer>
    </div>
  );
}
