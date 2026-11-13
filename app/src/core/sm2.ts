import type { CardProgress, Grade } from "./types";

const MIN_EASE = 1.3;
export const START_EASE = 2.5;

/**
 * SM-2 with four grades. "Nie wiem" (Again) resets the streak and the card comes back today;
 * the other grades lengthen the interval. Pure function: does not mutate its argument.
 */
export function review(p: CardProgress | undefined, grade: Grade, today: number): CardProgress {
  const cur = p ?? { reps: 0, lapses: 0, ease: START_EASE, interval: 0, due: today, last: today };
  let { reps, lapses, ease, interval } = cur;
  if (grade === "again") {
    return { reps: 0, lapses: lapses + (p && p.reps > 0 ? 1 : 0), ease: Math.max(MIN_EASE, ease - 0.2), interval: 0, due: today, last: today };
  }
  if (reps === 0) interval = grade === "easy" ? 4 : grade === "good" ? 1 : 1;
  else if (reps === 1) interval = grade === "easy" ? 7 : grade === "good" ? 3 : 2;
  else {
    const f = grade === "hard" ? 1.2 : grade === "good" ? ease : ease * 1.3;
    interval = Math.max(interval + 1, Math.round(interval * f));
  }
  if (grade === "hard") ease = Math.max(MIN_EASE, ease - 0.15);
  if (grade === "easy") ease += 0.15;
  return { reps: reps + 1, lapses, ease, interval, due: today + interval, last: today };
}

/** The interval a card would get after a given grade (for the labels under the buttons). */
export function previewInterval(p: CardProgress | undefined, grade: Grade): number {
  return review(p, grade, 0).interval;
}

export function intervalLabel(days: number): string {
  if (days <= 0) return "jeszcze dziś";
  if (days === 1) return "1 dzień";
  if (days < 30) return `${days} dni`;
  if (days < 365) return `${Math.round(days / 30)} mies.`;
  return `${(days / 365).toFixed(1).replace(".", ",")} roku`;
}
