import { describe, expect, it } from "vitest";
import type { Card } from "./types";
import { askText, hint, judgeKid, onlyFillers, soundKey, startWord, step } from "./kidsVoice";

const card = (en: string, pl = "x"): Card => ({ id: en, en, pl, emoji: "🙂" });
const ok = (en: string, heard: string | string[], island: string[] = []) =>
  judgeKid(card(en), Array.isArray(heard) ? heard : [heard], island.map((w) => card(w))).ok;

describe("kids voice: sounds alike", () => {
  it("melts vowels and swaps consonants that sound alike", () => {
    expect(soundKey("cat")).toBe(soundKey("cut"));
    expect(soundKey("cat")).toBe(soundKey("kat"));
    expect(soundKey("pencil case")).toBe(soundKey("pencil keys"));
    expect(soundKey("dog")).toBe(soundKey("dok"));
    expect(soundKey("window")).toBe(soundKey("vindow"));
    expect(soundKey("elephant")).toBe(soundKey("elefant"));
    expect(soundKey("cat")).not.toBe(soundKey("dog"));
  });
});

describe("kids voice: judging", () => {
  it("accepts the word, with articles and extra words around it", () => {
    expect(ok("cat", "cat")).toBe(true);
    expect(ok("cat", "a cat")).toBe(true);
    expect(ok("cat", "it's a cat")).toBe(true);
    expect(ok("pencil case", "my pencil case")).toBe(true);
    expect(ok("T-shirt", "t shirt")).toBe(true);
  });
  it("accepts what a recogniser makes of a child's accent", () => {
    expect(ok("cat", "cut")).toBe(true);
    expect(ok("pencil case", "pencil keys")).toBe(true);
    expect(ok("giraffe", "giraf")).toBe(true);
    expect(ok("hamster", "humster")).toBe(true);
    expect(ok("dog", ["dock", "doc"])).toBe(true);
  });
  it("looks at every alternative the recogniser offers", () => {
    expect(ok("horse", ["house", "horse"])).toBe(true);
  });
  it("does not accept another word of the island", () => {
    expect(ok("cat", "kite", ["cat", "kite"])).toBe(false);
    expect(ok("dog", "duck", ["dog", "duck"])).toBe(false);
    expect(ok("cat", "dog", ["cat", "dog"])).toBe(false);
    // Sounds like the answer and like nothing else on the island.
    expect(ok("cat", "cut", ["cat", "dog", "kite"])).toBe(true);
  });
  it("does not accept a different word", () => {
    expect(ok("cat", "dog")).toBe(false);
    expect(ok("elephant", "telephone")).toBe(false);
    expect(ok("cat", "")).toBe(false);
  });
  it("treats thinking noises as no answer", () => {
    expect(onlyFillers(["yyy"])).toBe(true);
    expect(onlyFillers(["hmm uh"])).toBe(true);
    expect(onlyFillers(["cat"])).toBe(false);
  });
});

describe("kids voice: the ladder of help", () => {
  it("naming the picture straight away is a first-try hit", () => {
    expect(step(startWord("say"), true)).toEqual({ done: "first" });
  });
  it("a miss leads to a hint, then to repeating after Echo", () => {
    const a = step(startWord("say"), false);
    expect(a).toEqual({ next: { step: "hint", repeats: 0 } });
    const b = step((a as { next: never }).next, false);
    expect(b).toEqual({ next: { step: "repeat", repeats: 0 } });
    expect(step((b as { next: never }).next, true)).toEqual({ done: "helped" });
  });
  it("never gets stuck: after repeating twice the word counts as practised", () => {
    let w = startWord("repeat");
    const r1 = step(w, false);
    expect(r1).toEqual({ next: { step: "repeat", repeats: 1 } });
    w = (r1 as { next: typeof w }).next;
    expect(step(w, false)).toEqual({ done: "practised" });
  });
  it("a new word repeated right is helped, not recalled", () => {
    expect(step(startWord("repeat"), true)).toEqual({ done: "helped" });
  });
});

describe("kids voice: what is shown and said", () => {
  it("hints with the first letter of each word", () => {
    expect(hint(card("cat"))).toBe("c _ _");
    expect(hint(card("pencil case"))).toBe("p _ _ _ _ _   c _ _ _");
    expect(hint(card("T-shirt"))).toBe("T - _ _ _ _ _");
  });
  it("asks with the first Polish meaning, without brackets", () => {
    expect(askText(card("rubber", "gumka (do mazania)"))).toBe("gumka. Jak to jest po angielsku?");
    expect(askText(card("schoolbag", "tornister, plecak"))).toBe("tornister. Jak to jest po angielsku?");
  });
});

describe("kids voice: neighbours on the island", () => {
  it("a close word that is itself on the island is not accepted", () => {
    expect(ok("grandma", "grandpa", ["grandma", "grandpa"])).toBe(false);
    expect(ok("grandma", "grandpa")).toBe(true);
  });
  it("does not hunt for the word inside a long sentence by sound", () => {
    expect(ok("aunt", "look left and right")).toBe(false);
  });
});
