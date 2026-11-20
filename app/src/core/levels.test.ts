import { describe, expect, it } from "vitest";
import { defaultState, type Deck } from "./types";
import { islands, type Island } from "./kids";
import { levelProgress, levelSpellWords, levelState, nextLevel, openedLevel, passed, recordLevel, SPELL_WORDS } from "./levels";
import { migrateHousehold } from "./profiles";

const WORDS = ["cat", "dog", "ball", "doll", "kite", "teddy bear", "train", "robot", "skateboard"];
const deck = (id: string, words = WORDS): Deck => ({
  format: "echo-deck", version: 2, id, title: id, from: "en", to: "pl", audience: "kids",
  cards: words.map((en, i) => ({ id: `${id}-${i}`, en, pl: `pl${i}`, emoji: String.fromCodePoint(0x1f600 + i) })),
});
const island = (d: Deck, s = defaultState()): Island => islands([d], [], s)[0];
const VOICE = { voice: true };
const NO_VOICE = { voice: false };

describe("island levels", () => {
  it("opens level 1 only, then each level after the previous one is passed with two stars", () => {
    let s = defaultState();
    const isl = island(deck("t"));
    expect([1, 2, 3].map((l) => levelState(s, isl, l as 1, VOICE))).toEqual(["open", "locked", "locked"]);
    s = recordLevel(s, isl.id, 1, 1);
    expect(levelState(s, isl, 2, VOICE)).toBe("locked");
    const before = s;
    s = recordLevel(s, isl.id, 1, 2);
    expect(levelState(s, isl, 2, VOICE)).toBe("open");
    expect(openedLevel(before, s, isl, VOICE)).toBe(2);
    expect(levelState(s, isl, 3, VOICE)).toBe("locked");
    s = recordLevel(s, isl.id, 2, 3);
    expect(levelState(s, isl, 3, VOICE)).toBe("open");
    expect(nextLevel(s, isl, VOICE)).toBe(3);
  });

  it("keeps the best stars of a level", () => {
    let s = recordLevel(defaultState(), "x", 1, 3);
    s = recordLevel(s, "x", 1, 1);
    expect(s.kids.levels?.x?.[1]).toBe(3);
    expect(passed(s, "x", 1)).toBe(true);
  });

  it("without a microphone, Powiedz is off and Literki is the last level", () => {
    let s = defaultState();
    const isl = island(deck("t"));
    expect(levelState(s, isl, 3, NO_VOICE)).toBe("off");
    expect(levelProgress(s, isl, NO_VOICE)).toEqual({ passed: 0, total: 2 });
    s = recordLevel(recordLevel(s, isl.id, 1, 3), isl.id, 2, 2);
    expect(levelProgress(s, isl, NO_VOICE)).toEqual({ passed: 2, total: 2 });
    expect(levelProgress(s, isl, VOICE)).toEqual({ passed: 2, total: 3 });
  });

  it("an island with too few short words skips Literki: level 3 opens after level 1", () => {
    const isl = island(deck("long", ["skateboard", "teddy bear", "hot-air balloon", "cat"]));
    const s = recordLevel(defaultState(), isl.id, 1, 2);
    expect(levelState(s, isl, 2, VOICE)).toBe("off");
    expect(levelState(s, isl, 3, VOICE)).toBe("open");
  });

  it("a sleeping island has every level locked; the parent's open-all setting opens all levels", () => {
    const a = deck("a"), b = deck("b");
    const [, second] = islands([a, b], [], defaultState());
    expect(second.asleep).toBe(true);
    expect(levelState(defaultState(), second, 1, VOICE)).toBe("locked");
    const open = islands([a, b], [], defaultState(), true)[1];
    expect([1, 2, 3].map((l) => levelState(defaultState(), open, l as 1, { voice: true, openAll: true }))).toEqual(["open", "open", "open"]);
  });

  it("Literki uses the island's spellable words, at most five, met words first", () => {
    const d = deck("t");
    let s = defaultState();
    s = { ...s, kids: { ...s.kids, words: { "t-7": { level: 0, sticker: false, seen: 1 } } } };
    const words = levelSpellWords(d, s);
    expect(words).toHaveLength(SPELL_WORDS);
    expect(words.map((c) => c.en)).toContain("robot");
    expect(words.map((c) => c.en)).not.toContain("skateboard");
  });

  it("level stars survive loading a save", () => {
    const h = migrateHousehold({ schema: 2, decks: [], profiles: [{ id: "k", name: "Ola", kind: "kids", kids: { stars: 0, words: {}, levels: { t: { 1: 3 } } } }], active: "k" });
    expect(h.profiles[0].kids.levels?.t?.[1]).toBe(3);
  });
});
