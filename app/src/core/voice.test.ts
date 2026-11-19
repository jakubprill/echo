import { describe, expect, it } from "vitest";
import { defaultState, type Card, type Deck } from "./types";
import { review } from "./sm2";
import { advance, buildVoiceQueue, judge, normalize, overrule, recordAnswer, restore, sameWord, scopeCards, snapshot, speakable, startSession, variants, type VoiceItem } from "./voice";

const card = (en: string, pl: string, id = en): Card => ({ id, en, pl });
const ask = (en: string, pl: string, dir: VoiceItem["dir"] = "en-pl"): VoiceItem => ({ card: card(en, pl), deckId: "d", dir, misses: 0 });
const verdict = (item: VoiceItem, ...heard: string[]) => judge(item, heard).verdict;

const deck = (n: number): Deck => ({
  format: "echo-deck", version: 2, id: "d", title: "d", from: "en", to: "pl",
  cards: Array.from({ length: n }, (_, i) => card(`word${i}`, `słowo${i}`, `c${i}`)),
});

describe("voice: expected answers", () => {
  it("splits meanings and makes brackets optional", () => {
    expect(variants("zmiana, modyfikacja", "pl")).toEqual(["zmiana", "modyfikacja"]);
    expect(variants("(to) resolve (into something)", "en")).toEqual(["resolve", "to resolve into something"]);
    expect(variants("RAM (random access memory)", "en")).toEqual(expect.arrayContaining(["RAM", "random access memory"]));
    expect(variants("hypothesis (pl. hypotheses)", "en")).toEqual(["hypothesis"]);
    expect(variants("aplikacja innego (zewnętrznego) dostawcy", "pl")).toEqual(expect.arrayContaining(["aplikacja innego dostawcy", "aplikacja innego zewnętrznego dostawcy"]));
    expect(variants("On/ona/to ma ...", "pl")).toEqual(["On ma", "ona ma", "to ma"]);
    expect(variants("to hail / as", "en")).toEqual(["to hail", "as"]);
  });
  it("reads entries without brackets and placeholders", () => {
    expect(speakable("(to) resolve (into something)")).toBe("resolve");
    expect(speakable("to look sb in the eye")).toBe("to look in the eye");
    expect(speakable("to improve sb's mood")).toBe("to improve mood");
    expect(speakable("dużo, wiele (niepoliczalne)")).toBe("dużo, wiele");
  });
  it("normalises diacritics, punctuation and numbers", () => {
    expect(normalize("Zażółć gęślą jaźń!", "pl")).toBe("zazolc gesla jazn");
    expect(normalize("I've got 2 cats.", "en")).toBe("ive got two cats");
    expect(normalize("5", "pl")).toBe("piec");
  });
});

describe("voice: judging", () => {
  it("accepts any meaning, with extra words around it", () => {
    const item = ask("alteration", "zmiana, modyfikacja");
    expect(verdict(item, "modyfikacja")).toBe("correct");
    expect(verdict(item, "to jest zmiana")).toBe("correct");
    expect(verdict(item, "kolano")).toBe("wrong");
  });
  it("tolerates Polish endings and misheard letters", () => {
    expect(verdict(ask("tired", "zmęczony"), "zmęczona")).toBe("correct");
    expect(verdict(ask("tired", "zmęczony"), "zmeczony")).toBe("correct");
    expect(verdict(ask("(to) evaluate", "oceniać, szacować"), "oceniam")).toBe("correct");
    expect(verdict(ask("attic", "strych"), "strychu")).toBe("correct");
  });
  it("tolerates articles, 'to' and placeholders in English", () => {
    expect(verdict(ask("(to) purchase", "kupować, nabywać", "pl-en"), "purchase")).toBe("correct");
    expect(verdict(ask("to stress sb out", "stresować kogoś", "pl-en"), "stress someone out")).toBe("correct");
    expect(verdict(ask("to stress sb out", "stresować kogoś", "pl-en"), "stress out")).toBe("correct");
    expect(verdict(ask("a great deal of", "dużo, wiele", "pl-en"), "great deal")).toBe("correct");
    expect(verdict(ask("rain check", "przełożenie na później", "pl-en"), "raincheck")).toBe("correct");
    expect(verdict(ask("lamp", "lampa", "pl-en"), "the lamp")).toBe("correct");
    expect(verdict(ask("cat", "kot"), "to kot")).toBe("correct");
    expect(verdict(ask("information system (IS)", "system informacyjny", "pl-en"), "where is the station")).toBe("wrong");
    expect(verdict(ask("It's got ...", "On/ona/to ma ..."), "ona ma")).toBe("correct");
  });
  it("does not accept the opposite word", () => {
    expect(verdict(ask("tangible benefit", "wymierna korzyść", "pl-en"), "intangible benefit")).toBe("wrong");
    expect(verdict(ask("intangible benefit", "niewymierna korzyść"), "wymierna korzyść")).toBe("wrong");
    expect(verdict(ask("accessible", "dostępny"), "niedostępny")).toBe("wrong");
  });
  it("takes any of the recogniser's alternatives", () => {
    expect(judge(ask("query", "zapytanie"), ["za pytanie", "zapytanie"])).toEqual({ verdict: "correct", heard: "zapytanie" });
  });
  it("understands commands in both languages, but the answer wins", () => {
    const item = ask("query", "zapytanie");
    expect(verdict(item, "powtórz")).toBe("repeat");
    expect(verdict(item, "Nie wiem")).toBe("skip");
    expect(verdict(item, "I don't know")).toBe("skip");
    expect(verdict(item, "pauza")).toBe("pause");
    expect(verdict(item, "koniec")).toBe("end");
    expect(verdict(ask("stop", "przystanek", "pl-en"), "stop")).toBe("correct");
    expect(verdict(ask("yes", "tak"), "tak")).toBe("correct");
  });
  it("treats silence and fillers as no answer yet", () => {
    expect(verdict(ask("query", "zapytanie"))).toBe("silence");
    expect(verdict(ask("query", "zapytanie"), "yyy")).toBe("silence");
    expect(verdict(ask("query", "zapytanie"), "hmm")).toBe("silence");
  });
  it("compares words with a misheard letter but the same start", () => {
    expect(sameWord("modyfikacje", "modyfikacja")).toBe(true);
    expect(sameWord("cat", "car")).toBe(false);
    expect(sameWord("tangible", "intangible")).toBe(false);
  });
});

describe("voice: session", () => {
  it("builds a shuffled queue of the chosen words, cut to the limit", () => {
    const d = deck(10);
    const q = buildVoiceQueue([d], new Set(["c1", "c2", "c3", "c4"]), "pl-en", 3, () => 0.3);
    expect(q).toHaveLength(3);
    expect(q.every((x) => ["c1", "c2", "c3", "c4"].includes(x.card.id) && x.dir === "pl-en")).toBe(true);
    expect(buildVoiceQueue([d, d], new Set(["c1"]), "en-pl", 0)).toHaveLength(1);
  });
  it("alternates directions in a mixed session", () => {
    const q = buildVoiceQueue([deck(6)], new Set(deck(6).cards.map((c) => c.id)), "mixed", 0, () => 0.7);
    expect(q.map((x) => x.dir)).toEqual(["pl-en", "en-pl", "pl-en", "en-pl", "pl-en", "en-pl"]);
  });
  it("selects words by scope", () => {
    const d = deck(4);
    const s = { ...defaultState(), progress: { c0: review(undefined, "good", 10), c1: review(review(review(undefined, "good", 1), "good", 2), "again", 5), c2: { ...review(undefined, "good", 1), due: 30 } } };
    const ids = (scope: Parameters<typeof scopeCards>[2]) => scopeCards([d], s, scope, 11).map((c) => c.id);
    expect(ids("all")).toEqual(["c0", "c1", "c2", "c3"]);
    expect(ids("new")).toEqual(["c3"]);
    expect(ids("due")).toEqual(["c0", "c1"]);
    expect(ids("hard")).toEqual(["c1"]);
  });
  it("moves on after a right answer and brings a missed word back a few words later", () => {
    const q = ["a", "b", "c", "d", "e"].map((w) => ask(w, w));
    let s = startSession(q);
    s = advance(s, false);
    expect(s.queue.map((x) => x.card.en)).toEqual(["b", "c", "d", "a", "e"]);
    expect(s.queue[3].misses).toBe(1);
    s = advance(advance(advance(s, true), true), true);
    s = advance(s, true);
    expect(s).toMatchObject({ right: 4, wrong: 1, firstTry: 3, total: 5 });
    expect(s.queue.map((x) => x.card.en)).toEqual(["e"]);
  });
  it("Uznaj takes back a miss", () => {
    const q = ["a", "b", "c"].map((w) => ask(w, w));
    const missed = q[0];
    const s = overrule(advance(startSession(q), false), missed);
    expect(s.queue.map((x) => x.card.en)).toEqual(["b", "c"]);
    expect(s).toMatchObject({ right: 1, wrong: 0, firstTry: 1 });
  });
});

describe("voice: progress", () => {
  const today = 100;
  it("grades new and due words like the buttons", () => {
    const item = ask("query", "zapytanie");
    let s = recordAnswer(defaultState(), item, true, today);
    expect(s.progress.query).toMatchObject({ reps: 1, due: today + 1 });
    expect(s.log[today]).toEqual({ reviews: 1, fresh: 1, correct: 1 });
    s = recordAnswer({ ...s, progress: { query: { ...s.progress.query, due: today } } }, item, false, today);
    expect(s.progress.query).toMatchObject({ reps: 0, due: today });
  });
  it("does not stretch a word that is not due, but a miss makes it due", () => {
    const item = ask("query", "zapytanie");
    const p = { ...review(undefined, "good", 90), due: today + 5 };
    const base = { ...defaultState(), progress: { query: p } };
    const ok = recordAnswer(base, item, true, today);
    expect(ok.progress.query).toBe(p);
    expect(ok.log[today]).toEqual({ reviews: 1, fresh: 0, correct: 1 });
    expect(recordAnswer(base, item, false, today).progress.query.due).toBe(today);
  });
  it("restores progress from a snapshot", () => {
    const item = ask("query", "zapytanie");
    const before = defaultState();
    const snap = snapshot(before, "query", today);
    const after = restore(recordAnswer(before, item, false, today), snap);
    expect(after.progress).toEqual({});
    expect(after.log).toEqual({});
  });
});
