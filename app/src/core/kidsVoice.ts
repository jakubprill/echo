// "Mów z Echo": the kids' voice round. The child says English words out loud: new words are
// repeated after Echo, known words are named from a picture. A child is never failed by the
// speech recogniser: a miss leads to a hint, then to repeating after Echo, and finally the word
// counts as practised. The judging is far more lenient than the adults' voice mode, because
// recognisers hear children and a Polish accent badly. Speaking and listening are platform ports;
// this module holds the rules only.
import type { Card } from "./types";
import { levenshtein } from "./quiz";
import { judge, normalize, speakable, variants } from "./voice";

// ─── judging ────────────────────────────────────────────────────────────────────

/**
 * How a word sounds, roughly, as letters: vowels melt into one, consonants that a Polish
 * child or a recogniser easily swaps become one letter (c/k/q, w/v, th/t), double letters
 * collapse and a final consonant loses its voice ("dog" sounds like "dok"). "cat", "cut" and
 * "kat" all become "kat"; "pencil case" and "pencil keys" become "pansalkas".
 */
export function soundKey(text: string): string {
  const words = normalize(text, "en").split(" ").filter(Boolean);
  const parts = words.map((w) => {
    let s = w;
    if (s.length > 3 && /[^aeiouy]e$/.test(s)) s = s.slice(0, -1); // silent final e: "case", "kite"
    s = s
      .replace(/ph/g, "f")
      .replace(/th/g, "t")
      .replace(/ck/g, "k")
      .replace(/c(?=[eiy])/g, "s")
      .replace(/[cq]/g, "k")
      .replace(/x/g, "ks")
      .replace(/w/g, "v")
      .replace(/(?!^)y/g, "a") // y after the first letter is a vowel ("happy", "keys")
      .replace(/[aeiou]+/g, "a")
      .replace(/(.)\1+/g, "$1")
      .replace(/(?!^)h/g, ""); // "ah", "oh" and a silent h
    // A voiced final consonant sounds voiceless: "dog" ~ "dok", "bed" ~ "bet", "his" ~ "hiss".
    return s.replace(/[bdgvz]$/, (c) => ({ b: "p", d: "t", g: "k", v: "f", z: "s" })[c]!);
  });
  return parts.join("").replace(/(.)\1+/g, "$1");
}

/** All runs of `n` neighbouring words, joined: what part of a longer phrase may be the answer. */
function windows(heard: string, n: number): string[] {
  const w = normalize(heard, "en").split(" ").filter(Boolean);
  const out: string[] = [];
  for (let size = Math.max(1, n - 1); size <= n + 1; size++)
    for (let i = 0; i + size <= w.length; i++) out.push(w.slice(i, i + size).join(" "));
  return out;
}

const spoken = (card: Card) => variants(card.en, "en");

/** The smallest distance in letters between what was heard and any way of saying the card. */
function distance(heard: string, card: Card): number {
  const h = normalize(heard, "en").replace(/ /g, "");
  return Math.min(...spoken(card).map((v) => levenshtein(h, normalize(v, "en").replace(/ /g, ""))));
}

/** Whether a stretch of heard words sounds like one of the card's variants. */
function soundsLike(heard: string, card: Card): boolean {
  const hk = soundKey(heard);
  if (!hk) return false;
  return spoken(card).some((v) => {
    const vk = soundKey(v);
    if (!vk) return false;
    if (hk === vk) return true;
    // Longer words may lose or gain one sound ("elefant" / "elephant" is exact anyway, "giraf" / "giraffe" too).
    return vk.length >= 5 && hk[0] === vk[0] && levenshtein(hk, vk) <= 1;
  });
}

export type KidsHeard = { ok: boolean; heard: string };

/**
 * Whether the child said the card's English word. First the adults' judging (exact meaning, small
 * slips), then by sound. A word that only sounds alike is accepted when it is not closer to
 * another word of the island: "kite" is not "cat" when both are on the island, but "cut" is.
 */
export function judgeKid(card: Card, alternatives: readonly string[], others: readonly Card[] = []): KidsHeard {
  const alts = alternatives.map((a) => a.trim()).filter(Boolean);
  const heard = alts[0] ?? "";
  if (!alts.length) return { ok: false, heard };
  const rivals = others.filter((o) => o.id !== card.id && o.en !== card.en);
  // "grandpa" is close enough to "grandma" for the adults' judging, but not when grandpa is on the island too.
  const isRival = (alt: string) => rivals.some((r) => distance(alt, r) === 0);
  const strict = judge({ card, deckId: "", dir: "pl-en", misses: 0 }, alts.filter((a) => !isRival(a)));
  if (strict.verdict === "correct") return { ok: true, heard: strict.heard };
  const n = Math.max(...spoken(card).map((v) => normalize(v, "en").split(" ").length));
  for (const alt of alts) {
    // Sounding alike is for short answers; in a long sentence some stretch nearly always sounds like something.
    if (normalize(alt, "en").split(" ").length > n + 2) continue;
    for (const part of windows(alt, n)) {
      if (!soundsLike(part, card)) continue;
      const mine = distance(part, card);
      if (rivals.some((r) => distance(part, r) < mine || (distance(part, r) === 0 && mine > 0))) continue;
      return { ok: true, heard: alt };
    }
  }
  return { ok: false, heard };
}

/** Thinking noises and nothing else: no answer yet. */
export function onlyFillers(alternatives: readonly string[]): boolean {
  const t = normalize(alternatives[0] ?? "", "en").split(" ").filter(Boolean);
  return t.every((w) => /^(e+|y+|m+|h+m+|u+[mh]?|a+h?|er+m?|o+h?)$/.test(w));
}

// ─── the ladder of help for one word ────────────────────────────────────────────

/**
 * What happens on the current word. "say": the child names the picture. "hint": the same, with
 * the first letters shown. "repeat": Echo says the word and the child repeats it.
 */
export type Step = "say" | "hint" | "repeat";

/** How a word ended: said by itself on the first try, said after help, or only practised. */
export type Outcome = "first" | "helped" | "practised";

export type WordState = { step: Step; repeats: number };

/** A known word starts by naming the picture; a new word (the round's introduction) starts by repeating. */
export const startWord = (first: "say" | "repeat"): WordState => ({ step: first, repeats: 0 });

/** How many times a child repeats after Echo before the word counts as practised anyway. */
export const MAX_REPEATS = 2;

/**
 * The next state after an answer: done with an outcome, or one rung further down the ladder.
 * Only naming the picture without help is "first"; anything said after a hint or after Echo is "helped".
 */
export function step(w: WordState, ok: boolean): { done: Outcome } | { next: WordState } {
  if (ok) return { done: w.step === "say" ? "first" : "helped" };
  if (w.step === "say") return { next: { step: "hint", repeats: 0 } };
  if (w.step === "hint") return { next: { step: "repeat", repeats: 0 } };
  if (w.repeats + 1 >= MAX_REPEATS) return { done: "practised" };
  return { next: { step: "repeat", repeats: w.repeats + 1 } };
}

/** The hint: the first letter of each word, the rest as gaps. "pencil case" → "p _ _ _ _ _   c _ _ _". */
export function hint(card: Card): string {
  const text = speakable(variants(card.en, "en")[0] ?? card.en);
  return text
    .split(" ")
    .map((w) => [...w].map((ch, i) => (i === 0 || !/\p{L}/u.test(ch) ? ch : "_")).join(" "))
    .join("   ");
}

/** What Echo says in Polish before a known word: the Polish word, then the question. */
export const askText = (card: Card): string => `${speakable(card.pl.split(/[,;]/)[0] ?? card.pl)}. Jak to jest po angielsku?`;
