// Jeden magazyn stanu aplikacji. Zmiany przechodzą przez update() z czystą funkcją
// z core/, a zapis na dysk dzieje się w tle przez port storage.
import { useSyncExternalStore } from "react";
import * as content from "virtual:echo-content";
import { audienceOf, mergeDecks, migrate, parseBook, parseDeck } from "../core/deck";
import { defaultState, type AppState, type Audience, type Book, type Deck } from "../core/types";
import { loadNewerRemote, loadState, saveState } from "../platform/storage";
import { speak } from "../platform/tts";

let state: AppState = defaultState();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

/** Talie i książki dołączone do tego builda. Nie trafiają do zapisu stanu. */
export const bundledDecks: Deck[] = content.decks.flatMap((d) => {
  try {
    return [parseDeck(d)];
  } catch {
    return [];
  }
});
export const bundledBooks: Book[] = content.books.flatMap((b) => parseBook(b) ?? []);

export async function initStore(): Promise<void> {
  const raw = await loadState();
  if (raw) {
    try {
      state = migrate(JSON.parse(raw));
    } catch {
      state = defaultState();
    }
  }
  listeners.forEach((l) => l());
  // Kopia z konta (tylko w artefakcie Claude) dociera później i wygrywa, gdy jest nowsza.
  void loadNewerRemote().then((remote) => {
    if (!remote) return;
    try {
      state = migrate(JSON.parse(remote));
      listeners.forEach((l) => l());
    } catch {
      // Uszkodzona kopia: zostaje stan lokalny.
    }
  });
}

export function getState(): AppState {
  return state;
}

export function update(fn: (s: AppState) => AppState): void {
  const next = fn(state);
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
  clearTimeout(timer);
  timer = setTimeout(() => void saveState(JSON.stringify(state)), 250);
}

export function replaceState(s: AppState): void {
  update(() => s);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState);
}

let memo: { user: Deck[]; all: Deck[] } | null = null;
export function allDecks(s: AppState): Deck[] {
  if (memo?.user !== s.decks) memo = { user: s.decks, all: mergeDecks(bundledDecks, s.decks) };
  return memo.all;
}

export function decksFor(s: AppState, line: Audience): Deck[] {
  return allDecks(s).filter((d) => audienceOf(d) === line);
}

export const isBundled = (id: string): boolean => bundledDecks.some((d) => d.id === id);

export function say(text: string, rate?: number): void {
  const { accent, voiceId, rate: r } = state.settings;
  void speak(text, { language: accent, voiceId, rate: rate ?? r });
}
