import type { AppState, Deck } from "./types";

/** Number of consecutive study days up to today (or yesterday if nothing has been studied today yet). */
export function streak(s: AppState, today: number): number {
  let d = s.log[today]?.reviews ? today : today - 1;
  let n = 0;
  while (s.log[d]?.reviews) {
    n++;
    d--;
  }
  return n;
}

export function lastDays(s: AppState, today: number, n: number): { day: number; reviews: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const day = today - (n - 1 - i);
    return { day, reviews: s.log[day]?.reviews ?? 0 };
  });
}

export type Buckets = { fresh: number; learning: number; young: number; mature: number };

/** Card breakdown: new, learning (interval < 3 days), reviewing (< 21 days), mastered. */
export function buckets(decks: Deck[], s: AppState): Buckets {
  const b: Buckets = { fresh: 0, learning: 0, young: 0, mature: 0 };
  for (const d of decks)
    for (const c of d.cards) {
      const p = s.progress[c.id];
      if (!p) b.fresh++;
      else if (p.interval < 3) b.learning++;
      else if (p.interval < 21) b.young++;
      else b.mature++;
    }
  return b;
}
