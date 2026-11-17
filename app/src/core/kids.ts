import type { AppState, Book, Card, Deck, KidsWord } from "./types";
import { shuffle } from "./date";

export const ROUND_SIZE = 6;
export const MAX_LEVEL = 3;

export type Island = { id: string; title: string; emoji: string; deck: Deck | null; lamps: number; stickers: number; gold: number; total: number };

export const word = (s: AppState, id: string): KidsWord => s.kids.words[id] ?? { level: 0, sticker: false, seen: 0 };

/** Cards that can be played with pictures. */
export const playable = (d: Deck): Card[] => d.cards.filter((c) => c.emoji);

/** Islands on the map: the book's units (including those without a deck yet), then decks outside any book. */
export function islands(decks: Deck[], books: Book[], s: AppState): Island[] {
  const make = (id: string, title: string, deck: Deck | null): Island => {
    const cards = deck ? playable(deck) : [];
    const stickers = cards.filter((c) => word(s, c.id).sticker).length;
    const gold = cards.filter((c) => stickerTier(word(s, c.id)) === 3).length;
    return { id, title, emoji: cards[0]?.emoji ?? "🏝️", deck, lamps: cards.length ? Math.floor((3 * stickers) / cards.length) : 0, stickers, gold, total: cards.length };
  };
  const used = new Set<string>();
  const out: Island[] = [];
  for (const b of books)
    for (const u of b.units) {
      const deck = decks.find((d) => d.book === b.id && d.unit === u.id) ?? null;
      if (deck) used.add(deck.id);
      out.push(make(`${b.id}/${u.id}`, u.title, deck));
    }
  for (const d of decks) if (!used.has(d.id)) out.push(make(d.id, d.title, d));
  return out;
}

export type KidsQuestion = { card: Card; options: Card[] };
export type KidsRound = { intro: Card[]; questions: KidsQuestion[] };

/** A round: the six least-known words in textbook order; new words are introduced first. */
export function buildRound(deck: Deck, s: AppState, rnd: () => number = Math.random): KidsRound {
  const cards = playable(deck);
  const ranked = cards.map((c, i) => ({ c, i, w: word(s, c.id) })).sort((a, b) => a.w.level - b.w.level || a.w.seen - b.w.seen || a.i - b.i);
  const chosen = ranked.slice(0, ROUND_SIZE);
  const questions = shuffle(chosen, rnd).map(({ c }) => {
    const emojis = new Set([c.emoji]);
    const others: Card[] = [];
    for (const o of shuffle(cards, rnd)) {
      if (emojis.has(o.emoji)) continue;
      emojis.add(o.emoji);
      others.push(o);
      if (others.length === 3) break;
    }
    return { card: c, options: shuffle([c, ...others], rnd) };
  });
  return { intro: chosen.filter((x) => x.w.seen === 0).map((x) => x.c), questions };
}

/** Result of one question: a first-try hit earns a star, a sticker and a level up. */
export function applyKidsAnswer(s: AppState, cardId: string, firstTry: boolean): AppState {
  const w = word(s, cardId);
  const next: KidsWord = firstTry ? { level: Math.min(MAX_LEVEL, w.level + 1), sticker: true, seen: w.seen + 1 } : { level: Math.max(0, w.level - 1), sticker: w.sticker, seen: w.seen + 1 };
  return { ...s, kids: { stars: s.kids.stars + (firstTry ? 1 : 0), words: { ...s.kids.words, [cardId]: next } } };
}

/** Sticker finish shown in the album: 0 none, 1 bronze, 2 silver, 3 gold (the word's level, at least bronze once earned). */
export type StickerTier = 0 | 1 | 2 | 3;
export const stickerTier = (w: KidsWord | undefined): StickerTier => (w?.sticker ? (Math.max(1, Math.min(MAX_LEVEL, w.level)) as StickerTier) : 0);

/** Round rating: finishing always earns one star; half the words right on the first try earns two, all but one earns three. */
export function roundStars(firstTry: number, total: number): 1 | 2 | 3 {
  if (total <= 0) return 1;
  if (firstTry >= Math.ceil((total * 5) / 6)) return 3;
  if (firstTry >= Math.ceil(total / 2)) return 2;
  return 1;
}

/** Longest run of first-try hits in a list of answers. */
export function bestStreak(firstTries: boolean[]): number {
  let best = 0, run = 0;
  for (const hit of firstTries) {
    run = hit ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}
