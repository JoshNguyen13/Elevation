import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { dayNumber } from "@/lib/daily/date";
import type { DailyPuzzle } from "@/lib/daily/puzzle";
import { iconOutline } from "@/lib/game/icon";
import { colors } from "@/lib/theme";
import PieceSvg from "./PieceSvg";
import styles from "./IntroScreen.module.css";

interface IntroScreenProps {
  puzzle: DailyPuzzle;
  // Already played today: the button goes to the results instead.
  alreadyPlayed: boolean;
  // Dev-only: ?replay=1 runs unsubmitted practice rounds.
  practice: boolean;
  playedYesterday: number | null;
  onStart: () => void;
}

// 00 — Daily Intro (Figma): today's materials, then Start Building.
export default function IntroScreen({
  puzzle,
  alreadyPlayed,
  practice,
  playedYesterday,
  onStart,
}: IntroScreenProps) {
  return (
    <div className={styles.screen}>
      <header className={styles.topBar}>
        <p className={styles.brand}>ELEVATION</p>
        <Badge>Day #{dayNumber(puzzle.date)}</Badge>
      </header>

      <section className={styles.main}>
        <h1 className={styles.title}>Today&apos;s Stack</h1>
        <p className={styles.blurb}>
          {alreadyPlayed
            ? "You've already played today's puzzle. Come back tomorrow for a new one."
            : practice
              ? "Practice mode: this run won't be saved or submitted."
              : "Build the tallest, sturdiest tower you can. One shot per day."}
        </p>
        <p className={styles.label}>TODAY&apos;S MATERIALS</p>
        <div className={styles.materials}>
          {puzzle.itemIds.map((id, i) => (
            <div key={i} className={styles.slot}>
              <PieceSvg outline={iconOutline(id)} fill={colors.ink} />
            </div>
          ))}
        </div>
        <Button onClick={onStart}>{alreadyPlayed ? "See Today's Results →" : "Start Building →"}</Button>
      </section>

      <footer className={styles.footer}>
        <p>New puzzle every day at midnight UTC</p>
        {playedYesterday !== null && playedYesterday > 0 && (
          <p>
            {playedYesterday.toLocaleString("en-US")} {playedYesterday === 1 ? "person" : "people"} played
            yesterday
          </p>
        )}
      </footer>
    </div>
  );
}
