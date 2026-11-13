import { describe, expect, it } from "vitest";
import { defaultState, type Deck } from "./types";
import { review } from "./sm2";
import { applyGrade, buildQueue, counts, markDueNow, requeue } from "./session";
import { DeckError, exportBackup, mergeDecks, parseBackup, parseDeckFile } from "./deck";
import { buildQuiz, checkTyped } from "./quiz";
import { applyKidsAnswer, buildRound, islands } from "./kids";
import { streak } from "./stats";

const deck = (id: string, n: number, extra: Partial<Deck> = {}): Deck => ({
  format: "echo-deck", version: 2, id, title: id, from: "en", to: "pl",
  cards: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}`, en: `word${i}`, pl: `słowo${i}`, ex: `This is word${i} here.`, gap: `word${i}`, emoji: String.fromCodePoint(0x1f600 + i) })),
  ...extra,
});

describe("SM-2", () => {
  it("wydłuża odstępy po dobrych odpowiedziach", () => {
    let p = review(undefined, "good", 100);
    expect(p).toMatchObject({ reps: 1, interval: 1, due: 101 });
    p = review(p, "good", 101);
    expect(p.interval).toBe(3);
    p = review(p, "good", 104);
    expect(p.interval).toBe(8);
    expect(p.due).toBe(112);
  });
  it("„Nie wiem” zeruje serię, obniża łatwość i zostawia kartę na dziś", () => {
    const p = review(review(review(undefined, "good", 1), "good", 2), "again", 5);
    expect(p).toMatchObject({ reps: 0, interval: 0, due: 5, lapses: 1 });
    expect(p.ease).toBeCloseTo(2.3);
  });
  it("łatwość nie spada poniżej 1,3", () => {
    let p = review(undefined, "good", 0);
    for (let i = 0; i < 20; i++) p = review(p, "again", i);
    expect(p.ease).toBeCloseTo(1.3);
  });
  it("„Łatwe” daje dłuższy odstęp niż „Dobrze”, a „Trudne” krótszy", () => {
    const base = review(review(undefined, "good", 0), "good", 1);
    const [h, g, e] = (["hard", "good", "easy"] as const).map((x) => review(base, x, 4).interval);
    expect(h).toBeLessThan(g);
    expect(g).toBeLessThan(e);
  });
});

describe("sesja nauki", () => {
  it("szanuje dzienny limit nowych kart i liczy powtórki", () => {
    let s = defaultState();
    s.settings.newPerDay = 3;
    const d = deck("a", 10);
    expect(buildQueue([d], s, 10)).toHaveLength(3);
    const q = buildQueue([d], s, 10);
    s = applyGrade(s, q[0], "good", 10);
    expect(counts([d], s, 10)).toMatchObject({ due: 0, fresh: 2, learned: 1 });
    expect(counts([d], s, 11)).toMatchObject({ due: 1, fresh: 3 });
    expect(buildQueue([d], s, 11)[0].card.id).toBe("a-0");
    expect(buildQueue([d], s, 11)[0].dir).toBe("pl-en");
    expect(s.log[10]).toEqual({ reviews: 1, fresh: 1, correct: 1 });
  });
  it("po „Nie wiem” karta wraca w tej samej sesji", () => {
    const s = defaultState();
    const q = buildQueue([deck("a", 6)], s, 1);
    const rest = requeue(q.slice(1), q[0]);
    expect(rest[3].card.id).toBe("a-0");
  });
  it("błąd w quizie przyspiesza powtórkę", () => {
    let s = defaultState();
    const d = deck("a", 1);
    s = applyGrade(s, buildQueue([d], s, 1)[0], "easy", 1);
    expect(s.progress["a-0"].due).toBe(5);
    expect(markDueNow(s, "a-0", 2).progress["a-0"].due).toBe(2);
  });
  it("liczy serię dni", () => {
    const s = defaultState();
    s.log = { 8: { reviews: 2, fresh: 0, correct: 2 }, 9: { reviews: 1, fresh: 0, correct: 1 } };
    expect(streak(s, 10)).toBe(2);
    expect(streak(s, 12)).toBe(0);
  });
});

describe("talie", () => {
  it("wczytuje jedną talię i tablicę talii, pomija nieznane pola", () => {
    const one = JSON.stringify({ ...deck("x", 2), extra: 1 });
    expect(parseDeckFile(one)[0].cards).toHaveLength(2);
    expect(parseDeckFile(JSON.stringify([deck("x", 1), deck("y", 1)]))).toHaveLength(2);
  });
  it("odrzuca zły plik z czytelnym komunikatem", () => {
    expect(() => parseDeckFile("{")).toThrow(DeckError);
    expect(() => parseDeckFile("{}")).toThrow(/nie ma żadnej talii/);
    expect(() => parseDeckFile(JSON.stringify({ format: "echo-deck", id: "z", cards: [{ en: "a" }] }))).toThrow(/„en” albo „pl”/);
  });
  it("talia użytkownika zastępuje wbudowaną o tym samym id", () => {
    const m = mergeDecks([deck("a", 1), deck("b", 1)], [deck("a", 5)]);
    expect(m.map((d) => [d.id, d.cards.length])).toEqual([["b", 1], ["a", 5]]);
  });
  it("kopia zapasowa wraca bez strat", () => {
    const s = defaultState();
    s.kids.stars = 7;
    s.decks = [deck("a", 2)];
    expect(parseBackup(exportBackup(s))).toEqual(s);
  });
});

describe("quiz", () => {
  it("toleruje literówkę, wielkość liter i przedimek", () => {
    expect(checkTyped("Boarding pass", "a boarding pass")).toBe("ok");
    expect(checkTyped("bording pass", "a boarding pass")).toBe("typo");
    expect(checkTyped("ticket", "a boarding pass")).toBe("wrong");
    expect(checkTyped("cat", "car")).toBe("wrong");
  });
  it("pytania wyboru mają cztery różne odpowiedzi z jedną poprawną", () => {
    const d = deck("a", 12);
    for (const q of buildQuiz(d.cards, 10)) {
      if (q.kind !== "choice") continue;
      expect(new Set(q.options).size).toBe(4);
      expect([q.card.pl, q.card.en]).toContain(q.options[q.answer]);
    }
  });
});

describe("linia dziecięca", () => {
  const d = deck("k", 9, { audience: "kids", book: "b", unit: "u1" });
  it("runda ma sześć słów, cztery różne obrazki w pytaniu, nowe słowa we wstępie", () => {
    const r = buildRound(d, defaultState());
    expect(r.questions).toHaveLength(6);
    expect(r.intro).toHaveLength(6);
    for (const q of r.questions) {
      expect(new Set(q.options.map((o) => o.emoji)).size).toBe(4);
      expect(q.options).toContain(q.card);
    }
  });
  it("trafienie daje gwiazdkę i naklejkę, a kolejna runda bierze nieznane słowa", () => {
    let s = defaultState();
    for (const q of buildRound(d, s).questions) s = applyKidsAnswer(s, q.card.id, true);
    expect(s.kids.stars).toBe(6);
    const next = buildRound(d, s).questions.map((q) => q.card.id);
    expect(next).toEqual(expect.arrayContaining(["k-6", "k-7", "k-8"]));
    const isl = islands([d], [{ format: "echo-book", version: 1, id: "b", title: "B", units: [{ id: "u1", title: "One" }, { id: "u2", title: "Two" }] }], s);
    expect(isl.map((i) => [i.title, i.lamps, !!i.deck])).toEqual([["One", 2, true], ["Two", 0, false]]);
  });
});
