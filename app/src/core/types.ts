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
  /** Folder shown in the deck list, e.g. "Lekcje z lektorką". Decks with a `book` are grouped by it when this is missing. */
  folder?: string;
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
  /** Game sounds in the kids line; missing in older saves means on. */
  sounds?: boolean;
  /** Kids map: all islands open at once instead of waking one after another. */
  kidsOpenAll?: boolean;
  /** Kids: "Mów z Echo", the round where the child speaks; a parent turns the microphone on. Missing means off. */
  kidsVoice?: boolean;
  /** Voice mode: the choices of the last session. */
  voice?: VoicePrefs;
};

/** Voice mode: direction, which words, how many, and whether answers are spoken or only listened to. */
export type VoicePrefs = {
  dir: "en-pl" | "pl-en" | "mixed";
  scope: "all" | "due" | "hard" | "new";
  limit: number;
  decks: string[];
  mic: boolean;
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
