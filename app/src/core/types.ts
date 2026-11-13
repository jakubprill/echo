// Echo domain model. This directory (core/) knows nothing about the browser, React or Tauri.

export type Card = {
  id: string;
  en: string;
  pl: string;
  ex?: string;
  gap?: string;
  note?: string;
  // echo-deck v2 (optional)
  exPl?: string;
  pos?: string;
  topics?: string[];
  lesson?: string;
  page?: number;
  emoji?: string;
  img?: string;
};

export type Audience = "adults" | "kids";

export type Deck = {
  format: "echo-deck";
  version: number;
  id: string;
  title: string;
  source?: string;
  level?: string;
  audience?: Audience;
  book?: string;
  unit?: string;
  from: string;
  to: string;
  cards: Card[];
};

export type BookUnit = { id: string; title: string; page?: number; deck?: string; status?: string };
export type Book = {
  format: "echo-book";
  version: number;
  id: string;
  title: string;
  audience?: Audience;
  units: BookUnit[];
};

/** Progress of one card in the SM-2 algorithm. Days are local day numbers. */
export type CardProgress = {
  reps: number;
  lapses: number;
  ease: number;
  interval: number;
  due: number;
  last: number;
};

export type Grade = "again" | "hard" | "good" | "easy";

export type DayLog = { reviews: number; fresh: number; correct: number };

/** A child's progress: level 0–3 (Leitner boxes) and a sticker for the first hit. */
export type KidsWord = { level: number; sticker: boolean; seen: number };

export type Settings = {
  line: Audience | null;
  theme: "system" | "light" | "dark";
  accent: "en-GB" | "en-US";
  voiceId: string | null;
  rate: number;
  autoSpeak: boolean;
  newPerDay: number;
};

export type AppState = {
  schema: 1;
  decks: Deck[];
  progress: Record<string, CardProgress>;
  log: Record<string, DayLog>;
  kids: { stars: number; words: Record<string, KidsWord> };
  settings: Settings;
};

export const defaultState = (): AppState => ({
  schema: 1,
  decks: [],
  progress: {},
  log: {},
  kids: { stars: 0, words: {} },
  settings: { line: null, theme: "system", accent: "en-GB", voiceId: null, rate: 0.95, autoSpeak: true, newPerDay: 10 },
});
