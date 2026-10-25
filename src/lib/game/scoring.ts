// Height score (§5.1): measured once, after the post-build settle, and banded
// as a % of the day's max possible height (MAX_STACK_PX).

export const HEIGHT_BANDS = [
  { name: "Grounded", minPercent: 0 },
  { name: "Mound", minPercent: 20 },
  { name: "Plateau", minPercent: 40 },
  { name: "Alps", minPercent: 60 },
  { name: "Limitless", minPercent: 80 },
] as const;

export type HeightBand = (typeof HEIGHT_BANDS)[number]["name"];

export interface HeightResult {
  heightPx: number;
  // Real-world meters, at the day's piece scale.
  heightM: number;
  // 0–100, of MAX_STACK_PX.
  percent: number;
  band: HeightBand;
}

export function bandFor(percent: number): HeightBand {
  return HEIGHT_BANDS.findLast((b) => percent >= b.minPercent)!.name;
}

export interface TestResult {
  survivedS: number;
  // false when the test ran to MAX_TEST_DURATION_S.
  collapsed: boolean;
  // 0.0–5.0 (§5.2).
  stability: number;
  // 0–100: height % and stability normalized to 0–100, averaged (§5.3 default, TBD).
  combined: number;
}

// §5.2 starting formula: stability = 5 × min(time_survived / max_test_duration, 1).
export function stabilityScore(survivedS: number, maxTestS: number): number {
  return 5 * Math.min(survivedS / maxTestS, 1);
}

export function combinedScore(heightPercent: number, stability: number): number {
  return Math.round((heightPercent + (stability / 5) * 100) / 2);
}
