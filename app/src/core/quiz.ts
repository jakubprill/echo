import type { Card } from "./types";
import { shuffle } from "./date";

export type Question =
  | { kind: "choice"; card: Card; prompt: string; hint: string; options: string[]; answer: number; speak?: string }
  | { kind: "type"; card: Card; prompt: string; hint: string; answer: string; sentence?: [string, string] };

const norm = (s: string) =>
  s.toLowerCase().replace(/[’`]/g, "'").replace(/\(.*?\)/g, "").replace(/^(to|a|an|the)\s+/, "").replace(/[.,!?;:]/g, "").replace(/\s+/g, " ").trim();

export function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Typed answer: case- and article-insensitive, tolerating one typo. */
export function checkTyped(input: string, expected: string): "ok" | "typo" | "wrong" {
  const a = norm(input), b = norm(expected);
  if (!a) return "wrong";
  if (a === b) return "ok";
  return b.length >= 5 && levenshtein(a, b) <= 1 ? "typo" : "wrong";
}

function distractors(card: Card, pool: Card[], pick: (c: Card) => string, rnd: () => number): string[] {
  const right = pick(card);
  const seen = new Set([right]);
  const out: string[] = [];
  for (const c of shuffle(pool, rnd)) {
    const v = pick(c);
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length === 3) break;
  }
  return out;
}

/** Builds a quiz: translation choice in both directions, typing, and fill-the-gap. */
export function buildQuiz(cards: Card[], n = 10, rnd: () => number = Math.random): Question[] {
  const chosen = shuffle(cards, rnd).slice(0, n);
  return chosen.map((card, i): Question => {
    const kind = i % 4;
    const gapAt = card.ex && card.gap ? card.ex.toLowerCase().indexOf(card.gap.toLowerCase()) : -1;
    if (kind === 3 && gapAt >= 0 && card.ex && card.gap)
      return { kind: "type", card, prompt: card.pl, hint: "Uzupełnij zdanie", answer: card.gap, sentence: [card.ex.slice(0, gapAt), card.ex.slice(gapAt + card.gap.length)] };
    if (kind === 2) return { kind: "type", card, prompt: card.pl, hint: "Napisz po angielsku", answer: card.en };
    const toPl = kind === 0 || cards.length < 4;
    const pick = (c: Card) => (toPl ? c.pl : c.en);
    const opts = distractors(card, cards, pick, rnd);
    if (opts.length < 3) return { kind: "type", card, prompt: card.pl, hint: "Napisz po angielsku", answer: card.en };
    const options = shuffle([pick(card), ...opts], rnd);
    return { kind: "choice", card, prompt: toPl ? card.en : card.pl, hint: toPl ? "Co znaczy" : "Jak to powiedzieć po angielsku", options, answer: options.indexOf(pick(card)), speak: toPl ? card.en : undefined };
  });
}
