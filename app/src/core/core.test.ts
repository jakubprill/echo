import { describe, expect, it } from "vitest";
import { defaultState, type Deck } from "./types";
import { review } from "./sm2";
import { applyGrade, buildQueue, counts, markDueNow, requeue } from "./session";
import { DeckError, exportBackup, mergeDecks, parseBackup, parseDeckFile } from "./deck";
import { buildQuiz, checkTyped } from "./quiz";
import { applyKidsAnswer, bestStreak, buildRound, islands, kidsWorlds, LOOSE_WORLD, roundStars, stickerTier, wakeNeed } from "./kids";
import { groupDecks, pickDecks, shortTitle } from "./folders";
import { streak } from "./stats";
import { backupPlan, isoDay } from "./backups";
import { compareVersions, newestUpdate } from "./update";
import { addProfile, editProfile, emptyHousehold, migrateHousehold, removeProfile, selectProfile, viewOf, withView } from "./profiles";

const deck = (id: string, n: number, extra: Partial<Deck> = {}): Deck => ({
  format: "echo-deck", version: 2, id, title: id, from: "en", to: "pl",
  cards: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}`, en: `word${i}`, pl: `słowo${i}`, ex: `This is word${i} here.`, gap: `word${i}`, emoji: String.fromCodePoint(0x1f600 + i) })),
  ...extra,
});

describe("SM-2", () => {
  it("lengthens intervals after good answers", () => {
    let p = review(undefined, "good", 100);
    expect(p).toMatchObject({ reps: 1, interval: 1, due: 101 });
    p = review(p, "good", 101);
    expect(p.interval).toBe(3);
    p = review(p, "good", 104);
    expect(p.interval).toBe(8);
    expect(p.due).toBe(112);
  });
  it("Again (Nie wiem) resets the streak, lowers ease and keeps the card for today", () => {
    const p = review(review(review(undefined, "good", 1), "good", 2), "again", 5);
    expect(p).toMatchObject({ reps: 0, interval: 0, due: 5, lapses: 1 });
    expect(p.ease).toBeCloseTo(2.3);
  });
  it("ease never drops below 1.3", () => {
    let p = review(undefined, "good", 0);
    for (let i = 0; i < 20; i++) p = review(p, "again", i);
    expect(p.ease).toBeCloseTo(1.3);
  });
  it("Easy gives a longer interval than Good, and Hard a shorter one", () => {
    const base = review(review(undefined, "good", 0), "good", 1);
    const [h, g, e] = (["hard", "good", "easy"] as const).map((x) => review(base, x, 4).interval);
    expect(h).toBeLessThan(g);
    expect(g).toBeLessThan(e);
  });
});

describe("study session", () => {
  it("respects the daily new-card limit and counts reviews", () => {
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
  it("after Again the card returns in the same session", () => {
    const s = defaultState();
    const q = buildQueue([deck("a", 6)], s, 1);
    const rest = requeue(q.slice(1), q[0]);
    expect(rest[3].card.id).toBe("a-0");
  });
  it("a quiz mistake brings the review forward", () => {
    let s = defaultState();
    const d = deck("a", 1);
    s = applyGrade(s, buildQueue([d], s, 1)[0], "easy", 1);
    expect(s.progress["a-0"].due).toBe(5);
    expect(markDueNow(s, "a-0", 2).progress["a-0"].due).toBe(2);
  });
  it("counts the day streak", () => {
    const s = defaultState();
    s.log = { 8: { reviews: 2, fresh: 0, correct: 2 }, 9: { reviews: 1, fresh: 0, correct: 1 } };
    expect(streak(s, 10)).toBe(2);
    expect(streak(s, 12)).toBe(0);
  });
});

describe("decks", () => {
  it("loads a single deck and an array of decks, ignoring unknown fields", () => {
    const one = JSON.stringify({ ...deck("x", 2), extra: 1 });
    expect(parseDeckFile(one)[0].cards).toHaveLength(2);
    expect(parseDeckFile(JSON.stringify([deck("x", 1), deck("y", 1)]))).toHaveLength(2);
  });
  it("rejects an invalid file with a readable message", () => {
    expect(() => parseDeckFile("{")).toThrow(DeckError);
    expect(() => parseDeckFile("{}")).toThrow(/nie ma żadnej talii/);
    expect(() => parseDeckFile(JSON.stringify({ format: "echo-deck", id: "z", cards: [{ en: "a" }] }))).toThrow(/„en” albo „pl”/);
  });
  it("a user deck replaces a bundled deck with the same id", () => {
    const m = mergeDecks([deck("a", 1), deck("b", 1)], [deck("a", 5)]);
    expect(m.map((d) => [d.id, d.cards.length])).toEqual([["b", 1], ["a", 5]]);
  });
  it("a backup round-trips without loss", () => {
    let h = addProfile(addProfile(emptyHousehold(), "Ania", "kids", "🦊"), "Jakub", "adults", "🐻");
    h = { ...h, decks: [deck("a", 2)], active: "p1" };
    h = withView(h, applyKidsAnswer(viewOf(h), "a-0", true));
    expect(parseBackup(exportBackup(h))).toEqual(h);
  });
  it("an alpha 0.1 backup still loads", () => {
    const s = defaultState();
    s.kids.stars = 3;
    const old = JSON.stringify({ format: "echo-backup", version: 1, state: s });
    expect(parseBackup(old).profiles.map((p) => p.kind)).toEqual(["kids"]);
  });
});

describe("profiles", () => {
  const two = () => addProfile(addProfile(emptyHousehold(), " Jakub ", "adults", "🐻"), "Ania", "kids", "🦊");

  it("adds profiles with unique ids and trimmed names, ignores an empty name", () => {
    const h = addProfile(two(), "   ", "kids", "🐸");
    expect(h.profiles.map((p) => [p.id, p.name, p.kind])).toEqual([["p1", "Jakub", "adults"], ["p2", "Ania", "kids"]]);
    const after = addProfile(removeProfile(h, "p1"), "Ola", "kids", "🐸");
    expect(new Set(after.profiles.map((p) => p.id)).size).toBe(2);
  });
  it("keeps progress separate per profile and decks shared", () => {
    let h = selectProfile(two(), "p1");
    const d = deck("a", 2);
    h = withView(h, { ...applyGrade(viewOf(h), buildQueue([d], viewOf(h), 1)[0], "good", 1), decks: [d] });
    expect(Object.keys(h.profiles[0].progress)).toEqual(["a-0"]);
    h = selectProfile(h, "p2");
    expect(viewOf(h).progress).toEqual({});
    expect(viewOf(h).decks).toEqual([d]);
    expect(viewOf(h).settings.line).toBe("kids");
    h = withView(h, applyKidsAnswer(viewOf(h), "a-1", true));
    expect(h.profiles[1].kids.stars).toBe(1);
    expect(h.profiles[0].kids.stars).toBe(0);
  });
  it("leaving a profile goes back to the chooser, settings stay per profile", () => {
    let h = selectProfile(two(), "p1");
    const v = viewOf(h);
    h = withView(h, { ...v, settings: { ...v.settings, rate: 0.7 } });
    h = withView(h, { ...viewOf(h), settings: { ...viewOf(h).settings, line: null } });
    expect(h.active).toBeNull();
    expect(h.profiles[0].settings.rate).toBe(0.7);
    expect(h.profiles[1].settings.rate).toBe(0.95);
  });
  it("an unchanged view returns the same household", () => {
    const h = selectProfile(two(), "p2");
    expect(withView(h, viewOf(h))).toBe(h);
  });
  it("removing the active profile returns to the chooser", () => {
    const h = removeProfile(selectProfile(two(), "p2"), "p2");
    expect(h.active).toBeNull();
    expect(h.profiles).toHaveLength(1);
  });
  it("renames and changes the avatar, never to an empty name", () => {
    let h = editProfile(two(), "p2", { name: "Anna", avatar: "🐢" });
    h = editProfile(h, "p2", { name: "  " });
    expect(h.profiles[1]).toMatchObject({ name: "Anna", avatar: "🐢" });
  });
  it("migrates alpha 0.1 state into an adult and a kids profile", () => {
    const s = defaultState();
    s.decks = [deck("a", 1)];
    s.progress = { "a-0": { reps: 1, lapses: 0, ease: 2.5, interval: 1, due: 2, last: 1 } };
    s.kids = { stars: 4, words: { "a-0": { level: 1, sticker: true, seen: 1 } } };
    s.settings = { ...s.settings, line: "kids", rate: 0.8 };
    const h = migrateHousehold(s);
    expect(h.decks).toEqual(s.decks);
    expect(h.profiles.map((p) => [p.name, p.kind])).toEqual([["Ja", "adults"], ["Dziecko", "kids"]]);
    expect(h.profiles[0].progress).toEqual(s.progress);
    expect(h.profiles[1].kids.stars).toBe(4);
    expect(h.profiles[1].settings.rate).toBe(0.8);
    expect(h.active).toBe("p2");
  });
  it("a fresh install has no profiles; junk is dropped", () => {
    expect(migrateHousehold(defaultState()).profiles).toEqual([]);
    expect(migrateHousehold(null)).toEqual(emptyHousehold());
    const h = migrateHousehold({ schema: 2, decks: [], profiles: [{ id: "x", name: "A", kind: "alien" }, { id: "y", name: "B", kind: "kids" }], active: "x" });
    expect(h.profiles.map((p) => p.id)).toEqual(["y"]);
    expect(h.active).toBeNull();
  });
});

describe("quiz", () => {
  it("tolerates a typo, letter case and articles", () => {
    expect(checkTyped("Boarding pass", "a boarding pass")).toBe("ok");
    expect(checkTyped("bording pass", "a boarding pass")).toBe("typo");
    expect(checkTyped("ticket", "a boarding pass")).toBe("wrong");
    expect(checkTyped("cat", "car")).toBe("wrong");
  });
  it("choice questions have four distinct answers with one correct", () => {
    const d = deck("a", 12);
    for (const q of buildQuiz(d.cards, 10)) {
      if (q.kind !== "choice") continue;
      expect(new Set(q.options).size).toBe(4);
      expect([q.card.pl, q.card.en]).toContain(q.options[q.answer]);
    }
  });
});

describe("kids line", () => {
  const d = deck("k", 9, { audience: "kids", book: "b", unit: "u1" });
  it("a round has six words, four distinct pictures per question, new words in the intro", () => {
    const r = buildRound(d, defaultState());
    expect(r.questions).toHaveLength(6);
    expect(r.intro).toHaveLength(6);
    for (const q of r.questions) {
      expect(new Set(q.options.map((o) => o.emoji)).size).toBe(4);
      expect(q.options).toContain(q.card);
    }
  });
  it("a hit earns a star and a sticker, and the next round picks unknown words", () => {
    let s = defaultState();
    for (const q of buildRound(d, s).questions) s = applyKidsAnswer(s, q.card.id, true);
    expect(s.kids.stars).toBe(6);
    const next = buildRound(d, s).questions.map((q) => q.card.id);
    expect(next).toEqual(expect.arrayContaining(["k-6", "k-7", "k-8"]));
    const isl = islands([d], [{ format: "echo-book", version: 1, id: "b", title: "B", units: [{ id: "u1", title: "One" }, { id: "u2", title: "Two" }] }], s);
    expect(isl.map((i) => [i.title, i.lamps, !!i.deck])).toEqual([["One", 2, true], ["Two", 0, false]]);
  });

  it("rates a round with one to three stars", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => roundStars(n, 6))).toEqual([1, 1, 1, 2, 2, 3, 3]);
    expect(roundStars(0, 0)).toBe(1);
    expect(roundStars(3, 3)).toBe(3);
  });

  it("measures the longest first-try streak", () => {
    expect(bestStreak([])).toBe(0);
    expect(bestStreak([true, true, false, true, true, true])).toBe(3);
  });

  it("turns stickers from bronze to gold as the word levels up", () => {
    expect(stickerTier(undefined)).toBe(0);
    let s = defaultState();
    const id = d.cards[0].id;
    const tiers: number[] = [];
    for (let i = 0; i < 4; i++) {
      s = applyKidsAnswer(s, id, true);
      tiers.push(stickerTier(s.kids.words[id]));
    }
    expect(tiers).toEqual([1, 2, 3, 3]);
    s = applyKidsAnswer(s, id, false);
    s = applyKidsAnswer(s, id, false);
    s = applyKidsAnswer(s, id, false);
    expect(stickerTier(s.kids.words[id])).toBe(1);
  });

  it("wakes islands one after another", () => {
    const book = { format: "echo-book" as const, version: 1 as const, id: "b", title: "B", units: [{ id: "u1", title: "One" }, { id: "u2", title: "Two" }, { id: "u3", title: "Three" }] };
    const d2 = deck("m", 9, { audience: "kids", book: "b", unit: "u2" });
    const d3 = deck("n", 9, { audience: "kids", book: "b", unit: "u3" });
    let s = defaultState();
    expect(islands([d, d2, d3], [book], s).map((i) => i.asleep)).toEqual([false, true, true]);
    expect(islands([d, d2, d3], [book], s, true).some((i) => i.asleep)).toBe(false);
    // Both sleeping islands point the child at the first island: 3 of its 9 stickers light a lamp.
    const sleeping = islands([d, d2, d3], [book], s);
    expect(wakeNeed(sleeping, 1)).toMatchObject({ from: { id: "b/u1" }, stickers: 3 });
    expect(wakeNeed(sleeping, 2)).toMatchObject({ from: { id: "b/u1" }, stickers: 3 });
    expect(wakeNeed(sleeping, 0)).toBeNull();
    for (const c of d.cards.slice(0, 2)) s = applyKidsAnswer(s, c.id, true);
    expect(wakeNeed(islands([d, d2, d3], [book], s), 1)?.stickers).toBe(1);
    s = applyKidsAnswer(s, d.cards[2].id, true);
    expect(islands([d, d2, d3], [book], s).map((i) => i.asleep)).toEqual([false, false, true]);
    // An island that already has stickers stays awake.
    s = applyKidsAnswer(defaultState(), d3.cards[0].id, true);
    expect(islands([d, d2, d3], [book], s).map((i) => i.asleep)).toEqual([false, true, false]);
  });
});

describe("automatic backups", () => {
  it("writes one file a day and keeps the newest five", () => {
    const files = ["echo-2026-11-01.json", "echo-2026-11-03.json", "echo-2026-11-02.json", "echo-2026-11-04.json", "echo-2026-11-05.json", "notes.txt"];
    expect(backupPlan(files, "2026-11-06")).toEqual({ write: "echo-2026-11-06.json", remove: ["echo-2026-11-01.json"] });
    expect(backupPlan(["echo-2026-11-06.json"], "2026-11-06")).toEqual({ write: null, remove: [] });
    expect(isoDay(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("stores a parent's kids options on the child's profile only", async () => {
    const { addProfile, editProfile } = await import("./profiles");
    const { migrateHousehold } = await import("./profiles");
    let h = migrateHousehold(null);
    h = addProfile(addProfile(h, "Ola", "kids", "🦊"), "Tata", "adults", "🐻");
    const [kid, adult] = h.profiles.slice(-2);
    h = editProfile(h, kid.id, { kidsOptions: { sounds: false, kidsOpenAll: true } });
    const after = (id: string) => h.profiles.find((p) => p.id === id)!.settings;
    expect([after(kid.id).sounds, after(kid.id).kidsOpenAll]).toEqual([false, true]);
    expect(after(adult.id).sounds).toBeUndefined();
  });
});

describe("self-update", () => {
  const rel = (tag: string, extra: Record<string, unknown> = {}) => ({
    tag_name: tag, draft: false, prerelease: true, html_url: `https://github.com/jakubprill/echo/releases/tag/${tag}`,
    assets: [
      { name: `Echo-${tag.slice(1)}-windows-x64-setup.exe`, size: 1, browser_download_url: `https://github.com/jakubprill/echo/releases/download/${tag}/Echo-${tag.slice(1)}-windows-x64-setup.exe` },
      { name: `Echo-${tag.slice(1)}-android-arm64.apk`, size: 133843598, browser_download_url: `https://github.com/jakubprill/echo/releases/download/${tag}/Echo-${tag.slice(1)}-android-arm64.apk` },
    ],
    ...extra,
  });
  it("orders versions by SemVer precedence", () => {
    const sorted = ["1.0.0", "0.1.0-alpha.10", "0.1.0", "0.1.0-alpha.2", "0.1.0-beta.1", "0.2.0-alpha.1", "0.1.0-alpha"];
    expect([...sorted].sort(compareVersions)).toEqual(["0.1.0-alpha", "0.1.0-alpha.2", "0.1.0-alpha.10", "0.1.0-beta.1", "0.1.0", "0.2.0-alpha.1", "1.0.0"]);
    expect(compareVersions("v0.1.0-alpha.4", "0.1.0-alpha.4")).toBe(0);
  });
  it("offers the newest newer pre-release with an Android APK", () => {
    const u = newestUpdate([rel("v0.1.0-alpha.5"), rel("v0.1.0-alpha.6"), rel("v0.1.0-alpha.4")], "0.1.0-alpha.4");
    expect(u).toMatchObject({ version: "0.1.0-alpha.6", name: "Echo-0.1.0-alpha.6-android-arm64.apk", size: 133843598 });
    expect(u?.url).toBe("https://github.com/jakubprill/echo/releases/download/v0.1.0-alpha.6/Echo-0.1.0-alpha.6-android-arm64.apk");
  });
  it("offers nothing when up to date, for drafts, without an APK or from another host", () => {
    expect(newestUpdate([rel("v0.1.0-alpha.4"), rel("v0.1.0-alpha.3")], "0.1.0-alpha.4")).toBeNull();
    expect(newestUpdate([rel("v0.1.0-alpha.5", { draft: true })], "0.1.0-alpha.4")).toBeNull();
    expect(newestUpdate([rel("v0.1.0-alpha.5", { assets: [] })], "0.1.0-alpha.4")).toBeNull();
    expect(newestUpdate([rel("v0.1.0-alpha.5", { assets: [{ name: "Echo-0.1.0-alpha.5-android-arm64.apk", browser_download_url: "https://evil.example/x.apk" }] })], "0.1.0-alpha.4")).toBeNull();
    expect(newestUpdate({ message: "API rate limit exceeded" }, "0.1.0-alpha.4")).toBeNull();
    expect(newestUpdate([rel("v0.1.0-alpha.5")], "not-a-version")).toBeNull();
  });
  it("a final release outranks its pre-releases", () => {
    expect(newestUpdate([rel("v0.1.0")], "0.1.0-alpha.9")?.version).toBe("0.1.0");
    expect(newestUpdate([rel("v0.1.0-alpha.9")], "0.1.0")).toBeNull();
  });
});

describe("deck folders", () => {
  const e2 = deck("e4it-2", 2, { title: "English 4 IT – 2. Databases", book: "english-4-it", unit: "unit-02" });
  const e1 = deck("e4it-1", 2, { title: "English 4 IT – 1. What is IT?", book: "english-4-it", unit: "unit-01" });
  const esl = deck("eslb", 2, { title: "ESL Brains – Nature", book: "esl-brains", unit: "nature" });
  const lesson = deck("lesson", 2, { title: "Lekcja 5.11" });
  const tagged = deck("idioms", 2, { title: "Idiomy 5.11", folder: "Lekcje z lektorką" });
  const tagged2 = deck("c2", 2, { title: "C2 9.11", folder: "lekcje z lektorką" });

  it("groups decks by folder or book, keeps the rest loose, orders units naturally", () => {
    const g = groupDecks([lesson, e2, esl, tagged, e1, tagged2]);
    expect(g.folders.map((f) => [f.title, f.decks.map((d) => d.id)])).toEqual([
      ["English 4 IT", ["e4it-1", "e4it-2"]],
      ["ESL Brains", ["eslb"]],
      ["Lekcje z lektorką", ["idioms", "c2"]],
    ]);
    expect(g.loose.map((d) => d.id)).toEqual(["lesson"]);
  });
  it("uses the book title and unit order from the book file when it is known", () => {
    const book = { format: "echo-book" as const, version: 1, id: "english-4-it", title: "English 4 IT (Helion)", units: [{ id: "unit-02", title: "Two" }, { id: "unit-01", title: "One" }] };
    const g = groupDecks([e1, e2], [book]);
    expect(g.folders[0].title).toBe("English 4 IT (Helion)");
    expect(g.folders[0].decks.map((d) => d.id)).toEqual(["e4it-2", "e4it-1"]);
  });
  it("falls back to the book id when the title has no prefix", () => {
    expect(groupDecks([deck("x", 1, { book: "hello-explorer-2" })]).folders[0].title).toBe("Hello explorer 2");
  });
  it("shortens titles inside a folder and picks decks for a session", () => {
    expect(shortTitle(e2, "English 4 IT")).toBe("2. Databases");
    expect(shortTitle(lesson, null)).toBe("Lekcja 5.11");
    expect(pickDecks([e1, e2, esl], { folder: "english 4 it" }).map((d) => d.id)).toEqual(["e4it-1", "e4it-2"]);
    expect(pickDecks([e1, e2, esl], { deckId: "eslb" }).map((d) => d.id)).toEqual(["eslb"]);
    expect(pickDecks([e1, e2, esl], {})).toHaveLength(3);
  });
  it("keeps the folder field on import", () => {
    const [d] = parseDeckFile(JSON.stringify({ ...tagged }));
    expect(d.folder).toBe("Lekcje z lektorką");
  });
  it("gives kids one world per book, each waking its own islands", () => {
    const k = (id: string, extra: Partial<Deck>) => deck(id, 3, { audience: "kids", ...extra });
    const w = kidsWorlds([k("a1", { title: "Book A – 1", book: "a", unit: "u1" }), k("b1", { title: "Book B – 1", book: "b", unit: "u1" }), k("a2", { title: "Book A – 2", book: "a", unit: "u2" }), k("z", {})], [], defaultState());
    expect(w.map((x) => [x.id, x.islands.map((i) => [i.id, i.asleep])])).toEqual([
      ["book a", [["a1", false], ["a2", true]]],
      ["book b", [["b1", false]]],
      [LOOSE_WORLD, [["z", false]]],
    ]);
  });
});
