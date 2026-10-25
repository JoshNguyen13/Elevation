import styles from "./DoomText.module.css";

// Text whose letters the disaster backdrop can move (src/lib/game/doomLetters.ts). Each
// letter is its own span; words don't break apart. Screen readers get the plain text.
export default function DoomText({ text }: { text: string }) {
  const words = text.split(" ");
  return (
    <>
      <span className={styles.srOnly}>{text}</span>
      <span aria-hidden>
        {words.map((word, w) => (
          <span key={w}>
            {w > 0 && " "}
            <span className={styles.word}>
              {[...word].map((ch, i) => (
                <span key={i} className={styles.letter} data-doom-letter="">
                  {ch}
                </span>
              ))}
            </span>
          </span>
        ))}
      </span>
    </>
  );
}
