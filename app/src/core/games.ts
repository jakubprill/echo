// Kids mini-games played as a reward: a good round (two or three stars) earns a ticket,
// and a ticket buys one game. Games only use words the child has already met.
import type { AppState, Card, Deck } from "./types";
import { shuffle } from "./date";
import { playable, word } from "./kids";

export type MiniGame = "memory" | "balloons" | "letters";

export const MINI_GAMES: MiniGame[] = ["memory", "balloons", "letters"];

/** Tickets a round earns: one for two or three stars. */
export const ticketsFor = (rating: number): number => (rating >= 2 ? 1 : 0);

export const tickets = (s: AppState): number => s.kids.tickets ?? 0;

export const addTickets = (s: AppState, n: number): AppState => (n > 0 ? { ...s, kids: { ...s.kids, tickets: tickets(s) + n } } : s);

/** Spends one ticket; the state is unchanged when there is none. */
export const spendTicket = (s: AppState): AppState => (tickets(s) > 0 ? { ...s, kids: { ...s.kids, tickets: tickets(s) - 1 } } : s);

/** Finishing a mini-game drops a few stars into the jar. */
export const GAME_STARS = 2;
export const finishGame = (s: AppState): AppState => ({ ...s, kids: { ...s.kids, stars: s.kids.stars + GAME_STARS } });

/** Fewest words a game needs to make sense. */
export const MIN_GAME_WORDS = 3;

/**
 * Words for a mini-game from the given decks: words with a sticker first (best known first),
 * then words already seen; never two words with the same picture.
 */
export function gameWords(decks: Deck[], s: AppState, n: number, rnd: () => number = Math.random): Card[] {
  const all = decks.flatMap(playable);
  const rank = (c: Card) => {
    const w = word(s, c.id);
    return w.sticker ? 0 : w.seen > 0 ? 1 : 2;
  };
  const known = shuffle(all, rnd).filter((c) => rank(c) < 2).sort((a, b) => rank(a) - rank(b));
  const out: Card[] = [];
  const pics = new Set<string>();
  for (const c of known) {
    if (pics.has(c.emoji!)) continue;
    pics.add(c.emoji!);
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

/** Whether the decks hold enough known words for a game. */
export const canPlay = (game: MiniGame, decks: Deck[], s: AppState): boolean => wordsFor(game, decks, s).length >= MIN_GAME_WORDS;
export const canPlayGames = (decks: Deck[], s: AppState): boolean => MINI_GAMES.some((g) => canPlay(g, decks, s));

export type MemoryTile = { key: string; card: Card; face: "pic" | "word" };

/** Memory: each word becomes a pair, a picture tile and an English word tile, shuffled. */
export const memoryBoard = (cards: Card[], rnd: () => number = Math.random): MemoryTile[] =>
  shuffle(
    cards.flatMap((c) => [
      { key: `${c.id}:pic`, card: c, face: "pic" as const },
      { key: `${c.id}:word`, card: c, face: "word" as const },
    ]),
    rnd,
  );

/** Two open memory tiles match when they show the same word as a picture and as text. */
export const isPair = (a: MemoryTile, b: MemoryTile): boolean => a.card.id === b.card.id && a.face !== b.face;

/** Memory rating by wrong guesses: a near-perfect memory earns three stars. */
export function memoryStars(misses: number, pairs: number): 1 | 2 | 3 {
  if (misses <= Math.ceil(pairs / 2)) return 3;
  if (misses <= pairs * 2) return 2;
  return 1;
}

export type BalloonWave = { target: Card; balloons: Card[] };

/**
 * Balloons: each wave asks for one word; the balloons show its picture and up to three others.
 * Every word is asked once, in random order.
 */
export function balloonWaves(cards: Card[], rnd: () => number = Math.random): BalloonWave[] {
  return shuffle(cards, rnd).map((target) => ({
    target,
    balloons: shuffle([target, ...shuffle(cards.filter((c) => c.id !== target.id), rnd).slice(0, 3)], rnd),
  }));
}

/** Letters: words short enough to spell from tiles (2–8 letters; spaces and hyphens are given). */
export const MAX_SPELL = 8;
const letters = (en: string): string[] => [...en.toLowerCase()].filter((ch) => /\p{L}/u.test(ch));
export const spellable = (c: Card): boolean => {
  const n = letters(c.en).length;
  return n >= 2 && n <= MAX_SPELL && /^[\p{L} '-]+$/u.test(c.en.trim());
};

/** One slot of a word to spell: a letter to place, or a space, hyphen or apostrophe shown from the start. */
export type SpellSlot = { ch: string; given: boolean };
export const spellSlots = (en: string): SpellSlot[] => [...en.trim().toLowerCase()].map((ch) => ({ ch, given: !/\p{L}/u.test(ch) }));

export type LetterTile = { key: number; ch: string };

/** The word's letters as tiles in a shuffled order that never spells the word already. */
export function letterTiles(en: string, rnd: () => number = Math.random): LetterTile[] {
  const ls = letters(en);
  const tiles = ls.map((ch, key) => ({ key, ch }));
  if (new Set(ls).size < 2) return tiles;
  for (;;) {
    const s = shuffle(tiles, rnd);
    if (s.some((t, i) => t.ch !== ls[i])) return s;
  }
}

/** Letters rating by wrong taps: one slip per word still earns three stars. */
export function lettersStars(misses: number, words: number): 1 | 2 | 3 {
  if (misses <= words) return 3;
  if (misses <= words * 3) return 2;
  return 1;
}

/** Words that each game will use; a game is offered only when it gets at least three. */
export function wordsFor(game: MiniGame, decks: Deck[], s: AppState, rnd: () => number = Math.random): Card[] {
  if (game === "letters") return gameWords(decks, s, 1000, rnd).filter(spellable).slice(0, 5);
  return gameWords(decks, s, game === "memory" ? 6 : 8, rnd);
}
