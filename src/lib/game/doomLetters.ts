// The letters on the page feel the disaster coming (disasters track): they flutter in the
// wind, tremble before a quake, hop with the fat guy's footsteps, shimmer with meteor heat,
// orbit a tornado and get batted by the cat. Each letter is a span from DoomText.
// View only: it moves text, never the board or anything the player is dragging.
import type { DisasterType } from "@/lib/supabase/types";
import type { LetterPulses } from "./disasterBackdrop";

// -1–1, stable per letter.
const seed = (i: number, salt: number) => {
  const s = Math.sin(i * 91.7 + salt * 47.3) * 24634.6345;
  return (s - Math.floor(s)) * 2 - 1;
};

// A batted letter: knocked out fast, then springs back with a wobble.
const batted = (t: number) => (t < 0 ? 0 : t < 0.12 ? t / 0.12 : Math.exp(-(t - 0.12) * 5) * Math.cos((t - 0.12) * 14));

// `d` 0–1 is how strongly the disaster is felt now; `side` the way it pushes.
export function moveLetters(
  letters: readonly HTMLElement[],
  type: DisasterType,
  side: 1 | -1,
  d: number,
  now: number,
  pulses: LetterPulses,
) {
  const swatted = new Map<number, { t: number; dir: number }>();
  for (const s of pulses.swats) swatted.set(s.index, { t: (now - s.at) / 1000, dir: s.dir });

  letters.forEach((el, i) => {
    const r1 = seed(i, 1);
    const r2 = seed(i, 2);
    const r3 = seed(i, 3);
    let x = 0;
    let y = 0;
    let rot = 0;
    let glow = 0;
    switch (type) {
      case "wind": {
        const flutter = Math.sin(now * 0.018 * (1 + 0.4 * r1) + i * 1.7);
        const g = pulses.gust * d;
        x = side * (d * d * 5 + g * (10 + 18 * Math.abs(r1))) + flutter * d * 2.2;
        y = Math.cos(now * 0.014 + i) * d * 1.5 - g * 3 * Math.abs(r2);
        rot = side * (d * 9 * (0.6 + 0.4 * flutter) + g * 22 * r2);
        // Blown away as the test starts, then drifting back so the text stays readable.
        const b = pulses.blow;
        x += side * b * (120 + 260 * Math.abs(r1));
        y -= b * (30 + 70 * Math.abs(r2));
        rot += side * b * (90 + 180 * r3);
        break;
      }
      case "earthquake": {
        const q = d * d;
        x = Math.sin(now * 0.07 * (1 + 0.3 * r1) + i * 2.3) * q * 3 + pulses.sway * 8;
        y = Math.cos(now * 0.09 * (1 + 0.3 * r2) + i) * q * 2.2;
        rot = Math.sin(now * 0.05 + i * 1.1) * q * 5;
        break;
      }
      case "fat-guy": {
        const hop = pulses.hop * pulses.hopAmp;
        y = -hop * (5 + 10 * Math.abs(r1));
        rot = hop * r2 * 10;
        x = hop * r3 * 2;
        break;
      }
      case "meteor": {
        y = Math.sin(now * 0.006 + i * 0.8) * d * 1.8;
        rot = Math.sin(now * 0.004 + i) * d * 2.5;
        glow = d;
        break;
      }
      case "tornado": {
        const angle = now * 0.003 * (1 + 2 * d) * (1 + 0.2 * r1) + i * 0.55;
        const radius = d * d * 8 * (0.6 + 0.4 * Math.abs(r2));
        x = Math.cos(angle) * radius;
        y = Math.sin(angle) * radius * 0.6;
        rot = Math.sin(angle) * d * 18;
        break;
      }
      case "cat": {
        x = Math.sin(now * 0.002 + i * 0.3) * d * 1.2;
        const s = swatted.get(i);
        if (s) {
          const e = batted(s.t);
          x += s.dir * e * (22 + 14 * Math.abs(r1));
          y -= Math.abs(e) * (5 + 6 * Math.abs(r2));
          rot += s.dir * e * 40;
        }
        break;
      }
    }
    el.style.transform = x === 0 && y === 0 && rot === 0 ? "" : `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
    el.style.textShadow = glow > 0.02 ? `0 0 ${(2 + 7 * glow).toFixed(1)}px rgba(255, 138, 61, ${(0.75 * glow).toFixed(2)})` : "";
  });
}

export function resetLetters(letters: readonly HTMLElement[]) {
  for (const el of letters) {
    el.style.transform = "";
    el.style.textShadow = "";
  }
}
