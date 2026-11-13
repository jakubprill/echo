import type { AppState, Card, Deck, Grade } from "./types";
import { review } from "./sm2";

export type StudyItem = { card: Card; deckId: string; fresh: boolean; dir: "en-pl" | "pl-en" };

export type Counts = { due: number; fresh: number; total: number; learned: number };

/** Ile kart czeka w danych taliach: powtórki na dziś i nowe w ramach dziennego limitu. */
export function counts(decks: Deck[], s: AppState, today: number): Counts {
  let due = 0, unseen = 0, total = 0, learned = 0;
  for (const d of decks)
    for (const c of d.cards) {
      total++;
      const p = s.progress[c.id];
      if (!p) unseen++;
      else {
        learned++;
        if (p.due <= today) due++;
      }
    }
  const left = Math.max(0, s.settings.newPerDay - (s.log[today]?.fresh ?? 0));
  return { due, fresh: Math.min(unseen, left), total, learned };
}

/** Kolejka nauki: najpierw zaległe powtórki (najstarsze pierwsze), potem nowe karty. */
export function buildQueue(decks: Deck[], s: AppState, today: number): StudyItem[] {
  const due: (StudyItem & { at: number })[] = [];
  const fresh: StudyItem[] = [];
  for (const d of decks)
    for (const card of d.cards) {
      const p = s.progress[card.id];
      if (!p) fresh.push({ card, deckId: d.id, fresh: true, dir: "en-pl" });
      // Po pierwszej udanej powtórce karta pojawia się też od strony polskiej.
      else if (p.due <= today) due.push({ card, deckId: d.id, fresh: false, dir: p.reps >= 1 && p.reps % 2 === 1 ? "pl-en" : "en-pl", at: p.due });
    }
  due.sort((a, b) => a.at - b.at);
  const left = Math.max(0, s.settings.newPerDay - (s.log[today]?.fresh ?? 0));
  return [...due, ...fresh.slice(0, left)];
}

/** Zapisuje ocenę karty i wpis w dzienniku dnia. Zwraca nowy stan. */
export function applyGrade(s: AppState, item: StudyItem, grade: Grade, today: number): AppState {
  const prev = s.progress[item.card.id];
  const log = s.log[today] ?? { reviews: 0, fresh: 0, correct: 0 };
  return {
    ...s,
    progress: { ...s.progress, [item.card.id]: review(prev, grade, today) },
    log: { ...s.log, [today]: { reviews: log.reviews + 1, fresh: log.fresh + (prev ? 0 : 1), correct: log.correct + (grade === "again" ? 0 : 1) } },
  };
}

/** Po „Nie wiem” karta wraca kilka pozycji dalej w tej samej sesji. */
export function requeue(queue: StudyItem[], item: StudyItem): StudyItem[] {
  const at = Math.min(queue.length, 3);
  return [...queue.slice(0, at), { ...item, fresh: false }, ...queue.slice(at)];
}

/** Błąd w quizie: karta wraca do najbliższej powtórki. */
export function markDueNow(s: AppState, cardId: string, today: number): AppState {
  const p = s.progress[cardId];
  if (!p || p.due <= today) return s;
  return { ...s, progress: { ...s.progress, [cardId]: { ...p, due: today } } };
}
