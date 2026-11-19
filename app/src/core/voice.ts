// Hands-free voice practice ("Tryb głosowy"). Echo says a word, listens to the spoken translation
// and judges it: right moves on, wrong says the answer and puts the word back into the queue.
// This module holds the rules only: which words, which direction, how lenient the judging is,
// and how a result changes the queue and the learning progress. Speaking and listening are
// platform ports (platform/tts.ts, platform/listen.ts); the loop that drives them is the screen.
import type { AppState, Card, CardProgress, DayLog, Deck, VoicePrefs } from "./types";
import { applyGrade, markDueNow } from "./session";
import { START_EASE } from "./sm2";
import { levenshtein } from "./quiz";
import { shuffle } from "./date";

export type Lang = "en" | "pl";
export type Direction = "en-pl" | "pl-en";
export type VoiceDir = VoicePrefs["dir"];
/** Which words a session starts with: everything, reviews due today, words that caused trouble, never studied. */
export type VoiceScope = VoicePrefs["scope"];

export type VoiceItem = { card: Card; deckId: string; dir: Direction; misses: number };

export type Verdict = "correct" | "wrong" | "repeat" | "skip" | "pause" | "end" | "silence";

// ─── choosing words ─────────────────────────────────────────────────────────────

export function inScope(s: AppState, card: Card, scope: VoiceScope, today: number): boolean {
  const p = s.progress[card.id];
  if (scope === "all") return true;
  if (scope === "new") return !p;
  if (scope === "due") return !!p && p.due <= today;
  return !!p && (p.lapses > 0 || p.ease < START_EASE || p.reps === 0);
}

/** The cards of the given decks that a scope selects, in deck order. */
export function scopeCards(decks: Deck[], s: AppState, scope: VoiceScope, today: number): Card[] {
  return decks.flatMap((d) => d.cards.filter((c) => inScope(s, c, scope, today)));
}

/** Session queue: the chosen cards shuffled, cut to the limit, each with a direction. */
export function buildVoiceQueue(decks: Deck[], ids: ReadonlySet<string>, dir: VoiceDir, limit: number, rnd: () => number = Math.random): VoiceItem[] {
  const picked = decks.flatMap((d) => d.cards.filter((c) => ids.has(c.id)).map((card) => ({ card, deckId: d.id })));
  // A card that appears in two decks is asked once.
  const unique = [...new Map(picked.map((x) => [x.card.id, x])).values()];
  const chosen = shuffle(unique, rnd).slice(0, limit > 0 ? limit : undefined);
  // Mixed sessions alternate, starting at random, so both directions get the same share.
  const first = rnd() < 0.5 ? 0 : 1;
  return chosen.map(({ card, deckId }, i) => ({
    card,
    deckId,
    dir: dir === "mixed" ? ((i + first) % 2 === 0 ? "en-pl" : "pl-en") : dir,
    misses: 0,
  }));
}

// ─── what is said and what is expected ──────────────────────────────────────────

export const promptLang = (item: VoiceItem): Lang => (item.dir === "en-pl" ? "en" : "pl");
export const answerLang = (item: VoiceItem): Lang => (item.dir === "en-pl" ? "pl" : "en");
export const promptText = (item: VoiceItem): string => (item.dir === "en-pl" ? item.card.en : item.card.pl);
export const answerText = (item: VoiceItem): string => (item.dir === "en-pl" ? item.card.pl : item.card.en);

/** Text for the speech engine: no brackets, no "sb/sth", no ellipses. */
export function speakable(text: string): string {
  return text
    .replace(/\(.*?\)/g, " ")
    .replace(/\.\.\.|…/g, " ")
    .replace(/\b(sb's|sth's|sb|sth)\b/gi, " ")
    .replace(/\s+([,;])/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
}

/** Splits on commas, semicolons and spaced slashes (" / ") that are not inside brackets. */
function splitTop(text: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of text.replace(/\s+\/\s+/g, ";")) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === "," || ch === ";")) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** "On/ona/to ma" is "On ma", "ona ma" or "to ma". */
function expandSlashes(text: string, depth = 0): string[] {
  const m = /[^\s/()]+(?:\/[^\s/()]+)+/.exec(text);
  if (!m || depth > 2) return [text];
  return m[0].split("/").flatMap((alt) => expandSlashes(text.slice(0, m.index) + alt + text.slice(m.index + m[0].length), depth + 1));
}

/**
 * Every way of saying the expected answer. "(to) resolve (into something)" accepts "resolve" and
 * "resolve into something"; "zmiana, modyfikacja" accepts either word; "RAM (random access memory)"
 * also accepts what is in English brackets. Grammar notes in brackets ("pl. hypotheses") are skipped.
 */
export function variants(text: string, lang: Lang): string[] {
  const out = new Set<string>();
  const clean = text.replace(/\.\.\.|…/g, " ").replace(/^\s*\d+\.\s*/, "").replace(/\((pl|np|łac|lit|e\.g|i\.e)\.[^)]*\)/gi, " ");
  for (const part of splitTop(clean).flatMap((p) => expandSlashes(p))) {
    out.add(part.replace(/\(.*?\)/g, " "));
    out.add(part.replace(/[()]/g, " "));
    // English brackets often hold the full name of an abbreviation; Polish ones hold context ("w bazach"), not an answer.
    if (lang === "en")
      for (const m of part.matchAll(/\((.*?)\)/g)) for (const inner of m[1].split(/[,;]/)) if (!onlyOptional(inner, lang)) out.add(inner);
  }
  return [...out].map((v) => v.replace(/\s+/g, " ").trim()).filter((v) => /\p{L}|\d/u.test(v));
}

// ─── judging a spoken answer ────────────────────────────────────────────────────

const FOLD: Record<string, string> = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };
const NUMBERS: Record<Lang, string[]> = {
  en: ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"],
  pl: ["zero", "jeden", "dwa", "trzy", "cztery", "pięć", "sześć", "siedem", "osiem", "dziewięć", "dziesięć", "jedenaście", "dwanaście", "trzynaście", "czternaście", "piętnaście", "szesnaście", "siedemnaście", "osiemnaście", "dziewiętnaście", "dwadzieścia"],
};
// Words that may be said or left out: articles, "to" before verbs, "się", placeholders, short prepositions.
const OPTIONAL: Record<Lang, Set<string>> = {
  en: new Set(["a", "an", "the", "to", "sb", "sth", "somebody", "something", "someone", "sbs", "sths", "ones", "of", "in", "on", "at", "for", "with", "into", "up", "be"]),
  pl: new Set(["sie", "ktos", "cos", "kogos", "czegos", "komus", "czyms", "kims", "w", "we", "z", "ze", "na", "do", "o", "od", "po", "za", "dla", "u", "przy"]),
};
const FILLERS = new Set(["eee", "ee", "e", "yyy", "yy", "y", "hmm", "hm", "mmm", "mm", "um", "uh", "uhm", "erm", "er", "ah", "aa", "aaa", "no", "yes", "tak", "okay", "ok"]);

/** Lower case, no diacritics or punctuation, numbers as words. */
export function normalize(text: string, lang: Lang): string {
  return text
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/'s\b/g, "s")
    .replace(/'/g, "")
    .replace(/\d+/g, (n) => NUMBERS[lang][Number(n)] ?? n)
    .replace(/[ąćęłńóśźż]/g, (c) => FOLD[c])
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tokens = (text: string, lang: Lang) => normalize(text, lang).split(" ").filter(Boolean);
const content = (t: string[], lang: Lang) => {
  const c = t.filter((w) => !OPTIONAL[lang].has(w));
  return c.length ? c : t;
};
/** "(to)", "(of something)", "(w coś)": brackets that hold only optional words are not an answer on their own. */
const onlyOptional = (text: string, lang: Lang) => tokens(text, lang).every((w) => OPTIONAL[lang].has(w));

/** How many letters may differ in a word of this length: speech engines mishear endings and short words alike. */
const tolerance = (n: number) => (n <= 3 ? 0 : n <= 7 ? 1 : n <= 11 ? 2 : 3);

/**
 * Same word, allowing a misheard letter or a different ending (Polish cases and genders, English
 * -s/-ed/-ing). The first letter must match, so "intangible" is not "tangible" and "niedostępny"
 * is not "dostępny".
 */
export function sameWord(heard: string, expected: string): boolean {
  if (heard === expected) return true;
  if (heard[0] !== expected[0]) return false;
  const n = Math.max(heard.length, expected.length);
  if (levenshtein(heard, expected) <= tolerance(Math.min(heard.length, expected.length))) return true;
  if (Math.min(heard.length, expected.length) < 4) return false;
  let p = 0;
  while (p < heard.length && p < expected.length && heard[p] === expected[p]) p++;
  return p >= Math.max(4, n - 3);
}

/** Whether one recognised phrase says one of the expected variants. Extra words around it are fine ("to jest pies"). */
export function saysVariant(heard: string, variant: string, lang: Lang): boolean {
  const h = tokens(heard, lang);
  const all = tokens(variant, lang);
  if (!h.length || !all.length) return false;
  // An answer made only of small words ("on", "w") has to be said exactly.
  if (all.every((w) => OPTIONAL[lang].has(w))) return h.join(" ") === all.join(" ");
  const want = content(all, lang);
  const hj = content(h, lang).join(""), wj = want.join("");
  // Very short answers ("kot", "IS") must be heard exactly, in a short phrase ("to kot"), not somewhere in a sentence.
  if (wj.length <= 3) return hj === wj || (want.length === 1 && h.length <= 3 && h.includes(wj));
  // Joined comparison covers split or merged words ("rain check" / "raincheck", "e mail" / "email").
  if (hj === wj || (wj.length >= 6 && hj[0] === wj[0] && levenshtein(hj, wj) <= 1)) return true;
  // Every content word of the answer must be heard, each by a different word; long phrases may lose one.
  const free = [...h];
  let missing = 0;
  for (const w of want) {
    const i = free.findIndex((x) => sameWord(x, w));
    if (i < 0) missing++;
    else free.splice(i, 1);
  }
  return missing === 0 || (want.length >= 4 && missing === 1);
}

const COMMANDS: { verdict: "repeat" | "skip" | "pause" | "end"; phrases: string[] }[] = [
  { verdict: "repeat", phrases: ["powtorz", "powtorz prosze", "jeszcze raz", "nie doslyszalem", "nie doslyszalam", "repeat", "repeat please", "say again", "say it again", "again", "once more", "pardon"] },
  { verdict: "skip", phrases: ["nie wiem", "nie pamietam", "nie mam pojecia", "pas", "pasuje", "dalej", "nastepne", "nastepny", "i dont know", "dont know", "i do not know", "no idea", "pass", "skip", "next"] },
  { verdict: "pause", phrases: ["pauza", "przerwa", "stop", "czekaj", "zaczekaj", "poczekaj", "wstrzymaj", "pause", "wait", "hold on"] },
  { verdict: "end", phrases: ["koniec", "zakoncz", "zakonczmy", "wystarczy", "end", "finish", "the end", "thats enough", "enough", "quit"] },
];

function command(heard: string): Verdict | null {
  const h = normalize(heard, "pl");
  if (!h || h.split(" ").length > 5) return null;
  for (const c of COMMANDS) if (c.phrases.some((p) => h === p || h.startsWith(p + " ") || h.endsWith(" " + p))) return c.verdict;
  return null;
}

export type Judgement = { verdict: Verdict; heard: string };

/**
 * Judges what the speech engine heard (its alternatives, best first). The answer wins over a
 * command, so "stop" is a right answer when the word is "stop". Fillers ("yyy", "hmm") count as
 * silence, so thinking aloud does not fail a word.
 */
export function judge(item: VoiceItem, alternatives: readonly string[]): Judgement {
  const alts = alternatives.map((a) => a.trim()).filter(Boolean);
  const heard = alts[0] ?? "";
  if (!alts.length) return { verdict: "silence", heard };
  const lang = answerLang(item);
  const expected = variants(answerText(item), lang);
  const hit = alts.find((a) => expected.some((v) => saysVariant(a, v, lang)));
  if (hit) return { verdict: "correct", heard: hit };
  if (tokens(heard, "pl").every((w) => FILLERS.has(w))) return { verdict: "silence", heard };
  return { verdict: command(heard) ?? "wrong", heard };
}

// ─── the session ────────────────────────────────────────────────────────────────

export type VoiceSession = { queue: VoiceItem[]; total: number; right: number; wrong: number; firstTry: number };

export const startSession = (queue: VoiceItem[]): VoiceSession => ({ queue, total: queue.length, right: 0, wrong: 0, firstTry: 0 });

/** Where a missed word comes back: a few words later, so it is not asked straight after hearing the answer. */
const BACK_AT = 3;

/** Moves the session on after a right or wrong answer to the first word in the queue. */
export function advance(s: VoiceSession, ok: boolean): VoiceSession {
  const [item, ...rest] = s.queue;
  if (!item) return s;
  if (ok) return { ...s, queue: rest, right: s.right + 1, firstTry: s.firstTry + (item.misses === 0 ? 1 : 0) };
  const back = { ...item, misses: item.misses + 1 };
  const at = Math.min(rest.length, BACK_AT);
  return { ...s, queue: [...rest.slice(0, at), back, ...rest.slice(at)], wrong: s.wrong + 1 };
}

/**
 * "Uznaj": the listener got it wrong, the answer was right. Undoes the miss: the word leaves the
 * queue and counts as known. `item` is the word as it was when it was missed.
 */
export function overrule(s: VoiceSession, item: VoiceItem): VoiceSession {
  const i = s.queue.findIndex((x) => x.card.id === item.card.id && x.dir === item.dir);
  if (i < 0) return s;
  return { ...s, queue: [...s.queue.slice(0, i), ...s.queue.slice(i + 1)], wrong: Math.max(0, s.wrong - 1), right: s.right + 1, firstTry: s.firstTry + (item.misses === 0 ? 1 : 0) };
}

/** What an answer is about to change, so "Uznaj" can put it back. */
export type AnswerSnapshot = { cardId: string; today: number; progress: CardProgress | undefined; log: DayLog | undefined };

export const snapshot = (s: AppState, cardId: string, today: number): AnswerSnapshot => ({ cardId, today, progress: s.progress[cardId], log: s.log[today] });

/** Puts a card's progress and the day's statistics back to a snapshot. */
export function restore(s: AppState, snap: AnswerSnapshot): AppState {
  const progress = { ...s.progress };
  if (snap.progress) progress[snap.cardId] = snap.progress;
  else delete progress[snap.cardId];
  const log = { ...s.log };
  if (snap.log) log[snap.today] = snap.log;
  else delete log[snap.today];
  return { ...s, progress, log };
}

/**
 * Records an answer in the learning progress, like the grade buttons would. A word that is new or
 * due today gets "Dobrze" (Good) or "Nie wiem" (Again). A word that is not due yet is not moved
 * forward by a right answer (that would stretch its interval early), but a wrong one makes it due
 * at the next review, as in the quiz. Every answer counts in the day's statistics.
 */
export function recordAnswer(s: AppState, item: VoiceItem, ok: boolean, today: number): AppState {
  const p = s.progress[item.card.id];
  if (!p || p.due <= today) return applyGrade(s, { card: item.card, deckId: item.deckId, fresh: !p, dir: item.dir }, ok ? "good" : "again", today);
  const log = s.log[today] ?? { reviews: 0, fresh: 0, correct: 0 };
  const next = ok ? s : markDueNow(s, item.card.id, today);
  return { ...next, log: { ...s.log, [today]: { ...log, reviews: log.reviews + 1, correct: log.correct + (ok ? 1 : 0) } } };
}
