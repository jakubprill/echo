// Three levels on every Kids island: the same words, each time a harder skill.
// Level 1 "Pokaż": hear the word and tap its picture (the island round).
// Level 2 "Literki": spell the island's words from letter tiles.
// Level 3 "Powiedz": say the words out loud ("Mów z Echo").
// A level is passed with a round of at least two stars, and passing it opens the next one.
// The best stars of each level are kept per island and shown as the island's level stars.
import type { AppState, Card, Deck } from "./types";
import { shuffle } from "./date";
import { pictureKey, playable, word, type Island } from "./kids";
import { MIN_GAME_WORDS, spellable } from "./games";

export type Level = 1 | 2 | 3;
export const LEVELS: Level[] = [1, 2, 3];

/** Best stars per level of one island (a missing level has not been played yet). */
export type IslandLevels = Partial<Record<Level, 1 | 2 | 3>>;

/** Stars a round needs to pass its level (the same two stars that earn a mini-game ticket). */
export const PASS_STARS = 2;

/** Words spelled in one Literki level round. */
export const SPELL_WORDS = 5;

/** What the device and the parent allow: "Powiedz" needs a microphone turned on by a parent. */
export type LevelOptions = { voice: boolean; openAll?: boolean };

export type LevelState =
  /** Can be played now. */
  | "open"
  /** Waits for the previous level to be passed. */
  | "locked"
  /** Cannot be played on this island or device: too few words to spell, or no microphone. */
  | "off";

export const islandLevels = (s: AppState, islandId: string): IslandLevels => s.kids.levels?.[islandId] ?? {};

export const levelStars = (s: AppState, islandId: string, level: Level): 0 | 1 | 2 | 3 => islandLevels(s, islandId)[level] ?? 0;

export const passed = (s: AppState, islandId: string, level: Level): boolean => levelStars(s, islandId, level) >= PASS_STARS;

/** Words of the island that can be spelled from tiles. */
export const spellWords = (deck: Deck): Card[] => playable(deck).filter(spellable);

/** Whether a level can be played on this island at all (ignoring the order of levels). */
export function levelAvailable(island: Island, level: Level, opt: LevelOptions): boolean {
  if (!island.deck) return false;
  if (level === 2) return spellWords(island.deck).length >= MIN_GAME_WORDS;
  if (level === 3) return opt.voice;
  return true;
}

/**
 * Whether a level is open, locked or off. Level 1 is open on every awake island; a later level opens
 * once the nearest earlier level that can be played is passed. A level that is off is skipped, so
 * without a microphone Literki is the last level, and an island with long words goes from 1 to 3.
 * The parent's "all islands open" setting opens every level too.
 */
export function levelState(s: AppState, island: Island, level: Level, opt: LevelOptions): LevelState {
  if (!levelAvailable(island, level, opt)) return "off";
  if (island.asleep) return "locked";
  if (opt.openAll) return "open";
  for (let l = level - 1; l >= 1; l--) {
    const prev = l as Level;
    if (!levelAvailable(island, prev, opt)) continue;
    return passed(s, island.id, prev) ? "open" : "locked";
  }
  return "open";
}

/** The level to suggest: the first open level not passed yet, else the last open one. */
export function nextLevel(s: AppState, island: Island, opt: LevelOptions): Level {
  const open = LEVELS.filter((l) => levelState(s, island, l, opt) === "open");
  return open.find((l) => !passed(s, island.id, l)) ?? open[open.length - 1] ?? 1;
}

/** Levels passed out of those that can be played on the island: what the island's level stars show. */
export function levelProgress(s: AppState, island: Island, opt: LevelOptions): { passed: number; total: number } {
  const avail = LEVELS.filter((l) => levelAvailable(island, l, opt));
  return { passed: avail.filter((l) => passed(s, island.id, l)).length, total: avail.length };
}

/** Records a finished level round, keeping the best stars. */
export function recordLevel(s: AppState, islandId: string, level: Level, stars: 1 | 2 | 3): AppState {
  const cur = islandLevels(s, islandId);
  if ((cur[level] ?? 0) >= stars) return s;
  return { ...s, kids: { ...s.kids, levels: { ...s.kids.levels, [islandId]: { ...cur, [level]: stars } } } };
}

/** The level that a round opened, if any: compares the level states before and after the round. */
export function openedLevel(before: AppState, after: AppState, island: Island, opt: LevelOptions): Level | null {
  return LEVELS.find((l) => levelState(before, island, l, opt) === "locked" && levelState(after, island, l, opt) === "open") ?? null;
}

/**
 * Words for a Literki level round: the island's spellable words, words the child has met first
 * (best known last, so the round practises what is still shaky), at most five, no picture twice.
 */
export function levelSpellWords(deck: Deck, s: AppState, rnd: () => number = Math.random): Card[] {
  const rank = (c: Card) => {
    const w = word(s, c.id);
    return w.seen > 0 ? w.level : 10;
  };
  const sorted = shuffle(spellWords(deck), rnd).sort((a, b) => rank(a) - rank(b));
  const out: Card[] = [];
  const pics = new Set<string>();
  for (const c of sorted) {
    if (pics.has(pictureKey(c))) continue;
    pics.add(pictureKey(c));
    out.push(c);
    if (out.length === SPELL_WORDS) break;
  }
  return shuffle(out, rnd);
}
