import type { AppState, Book, Card, Deck, KidsWord } from "./types";
import { shuffle } from "./date";
import { groupDecks, shortTitle } from "./folders";

export const ROUND_SIZE = 6;
export const MAX_LEVEL = 3;

export type Island = { id: string; title: string; emoji: string; deck: Deck | null; lamps: number; stickers: number; gold: number; total: number; asleep: boolean };

export const word = (s: AppState, id: string): KidsWord => s.kids.words[id] ?? { level: 0, sticker: false, seen: 0 };

/** Cards that can be played with pictures. */
export const playable = (d: Deck): Card[] => d.cards.filter((c) => c.emoji);

/**
 * Islands on the map: the book's units (including those without a deck yet), then decks outside any book.
 * Islands wake one after another: an island sleeps until the previous playable one has a lamp lit
 * (or it already has stickers of its own). `openAll` (a parent setting) wakes them all.
 */
export function islands(decks: Deck[], books: Book[], s: AppState, openAll = false): Island[] {
  const make = (id: string, title: string, deck: Deck | null): Island => {
    const cards = deck ? playable(deck) : [];
    const stickers = cards.filter((c) => word(s, c.id).sticker).length;
    const gold = cards.filter((c) => stickerTier(word(s, c.id)) === 3).length;
    return { id, title, emoji: cards[0]?.emoji ?? "🏝️", deck, lamps: cards.length ? Math.floor((3 * stickers) / cards.length) : 0, stickers, gold, total: cards.length, asleep: false };
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
  if (openAll) return out;
  let prev: Island | null = null;
  for (const isl of out) {
    if (!isl.deck) continue;
    isl.asleep = prev !== null && (prev.asleep || prev.lamps === 0) && isl.stickers === 0;
    prev = isl;
  }
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

/** A world on the kids' shelf: one folder (usually a textbook) with its own map of islands. */
export type KidsWorld = { id: string; title: string; islands: Island[] };

export const LOOSE_WORLD = "__other";

/**
 * Kids decks grouped by folder, each with its own island map (islands wake one after another within a world).
 * Decks outside any folder share one world, "Inne wyspy".
 */
export function kidsWorlds(decks: Deck[], books: Book[], s: AppState, openAll = false): KidsWorld[] {
  const g = groupDecks(decks, books);
  // Inside a book the islands are named by unit: "Unit 1: Family" instead of "Hello Explorer 2 – Unit 1: Family".
  const world = (id: string, title: string, ds: Deck[]): KidsWorld => ({
    id,
    title,
    islands: islands(id === LOOSE_WORLD ? ds : ds.map((d) => ({ ...d, title: shortTitle(d, title) })), books.filter((b) => ds.some((d) => d.book === b.id)), s, openAll),
  });
  const out = g.folders.map((f) => world(f.id, f.title, f.decks));
  if (g.loose.length) out.push(world(LOOSE_WORLD, "Inne wyspy", g.loose));
  return out;
}

/** What wakes a sleeping island: more stickers on the nearest earlier awake island, enough to light its first lamp. */
export function wakeNeed(list: Island[], index: number): { from: Island; stickers: number } | null {
  if (!list[index]?.asleep) return null;
  for (let i = index - 1; i >= 0; i--) {
    const from = list[i];
    if (!from.deck || from.asleep) continue;
    return { from, stickers: Math.max(1, Math.ceil(from.total / 3) - from.stickers) };
  }
  return null;
}
