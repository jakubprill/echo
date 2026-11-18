// The app's single state store. The saved document is a Household (shared decks + profiles);
// screens see the active profile as AppState and change it through update() with a pure function
// from core/. Saving happens in the background through the storage port.
import { useSyncExternalStore } from "react";
import * as content from "virtual:echo-content";
import { isoDay } from "../core/backups";
import { audienceOf, exportBackup, mergeDecks, parseBook, parseDeck } from "../core/deck";
import { emptyHousehold, migrateHousehold, viewOf, withView, type Household } from "../core/profiles";
import type { AppState, Audience, Book, Deck } from "../core/types";
import { dailyBackup, loadNewerRemote, loadState, saveState } from "../platform/storage";
import { speak } from "../platform/tts";

let household: Household = emptyHousehold();
let state: AppState = viewOf(household);
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

/** Decks and books bundled with this build. They are not written to saved state. */
export const bundledDecks: Deck[] = content.decks.flatMap((d) => {
  try {
    return [parseDeck(d)];
  } catch {
    return [];
  }
});
export const bundledBooks: Book[] = content.books.flatMap((b) => parseBook(b) ?? []);

function load(json: string): boolean {
  try {
    household = migrateHousehold(JSON.parse(json));
    state = viewOf(household);
    return true;
  } catch {
    return false; // corrupted copy: keep what we have
  }
}

export async function initStore(): Promise<void> {
  const raw = await loadState();
  if (raw) load(raw);
  listeners.forEach((l) => l());
  void dailyBackup(isoDay(new Date()), () => exportBackup(household));
  // The account copy (Claude artifact only) arrives later and wins when it is newer.
  void loadNewerRemote().then((remote) => {
    if (remote && load(remote)) listeners.forEach((l) => l());
  });
}

function commit(next: Household): void {
  if (next === household) return;
  household = next;
  state = viewOf(household);
  listeners.forEach((l) => l());
  clearTimeout(timer);
  timer = setTimeout(() => void saveState(JSON.stringify(household)), 250);
}

/** The active profile's state. */
export function getState(): AppState {
  return state;
}

/** Changes the active profile (and the shared decks). */
export function update(fn: (s: AppState) => AppState): void {
  const next = fn(state);
  if (next !== state) commit(withView(household, next));
}

export function getHousehold(): Household {
  return household;
}

/** Changes profiles: add, edit, remove, switch. */
export function updateHousehold(fn: (h: Household) => Household): void {
  commit(fn(household));
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState);
}

export function useHousehold(): Household {
  return useSyncExternalStore(subscribe, getHousehold);
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
