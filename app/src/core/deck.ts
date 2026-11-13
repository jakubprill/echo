import type { AppState, Audience, Book, Card, Deck } from "./types";
import { defaultState } from "./types";

export class DeckError extends Error {}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function parseCard(raw: unknown, deckId: string, i: number): Card {
  const c = (raw ?? {}) as Record<string, unknown>;
  const en = str(c.en);
  const pl = str(c.pl);
  if (!en || !pl) throw new DeckError(`Karta ${i + 1} w talii „${deckId}” nie ma pola „en” albo „pl”.`);
  const card: Card = { id: str(c.id) || `${deckId}-${String(i + 1).padStart(2, "0")}`, en, pl };
  for (const k of ["ex", "gap", "note", "exPl", "pos", "lesson", "emoji", "img"] as const) {
    const v = str(c[k]);
    if (v) card[k] = v;
  }
  if (Array.isArray(c.topics)) card.topics = c.topics.filter((t): t is string => typeof t === "string");
  if (typeof c.page === "number") card.page = c.page;
  return card;
}

/** Parses a single echo-deck (v1 or v2). Unknown fields are ignored. */
export function parseDeck(raw: unknown): Deck {
  const d = (raw ?? {}) as Record<string, unknown>;
  if (d.format !== "echo-deck") throw new DeckError("To nie jest talia Echo (brak pola format: \"echo-deck\").");
  const id = str(d.id);
  if (!id) throw new DeckError("Talia nie ma identyfikatora (pole „id”).");
  if (!Array.isArray(d.cards) || d.cards.length === 0) throw new DeckError(`Talia „${id}” nie ma żadnych kart.`);
  const cards = d.cards.map((c, i) => parseCard(c, id, i));
  const seen = new Set<string>();
  for (const c of cards) {
    if (seen.has(c.id)) throw new DeckError(`W talii „${id}” powtarza się identyfikator karty „${c.id}”.`);
    seen.add(c.id);
  }
  const deck: Deck = {
    format: "echo-deck",
    version: typeof d.version === "number" ? d.version : 1,
    id,
    title: str(d.title) || id,
    from: str(d.from) || "en",
    to: str(d.to) || "pl",
    cards,
  };
  for (const k of ["source", "level", "book", "unit"] as const) {
    const v = str(d[k]);
    if (v) deck[k] = v;
  }
  if (d.audience === "kids" || d.audience === "adults") deck.audience = d.audience;
  return deck;
}

/** A file may contain one deck, an array of decks, or an Echo backup. */
export function parseDeckFile(text: string): Deck[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new DeckError("Plik nie jest poprawnym JSON-em.");
  }
  const list = Array.isArray(data) ? data : [data];
  const decks = list.filter((x) => (x as { format?: string })?.format === "echo-deck").map(parseDeck);
  if (decks.length === 0) throw new DeckError("W pliku nie ma żadnej talii Echo.");
  return decks;
}

export function parseBook(raw: unknown): Book | null {
  const b = raw as Book;
  return b && b.format === "echo-book" && typeof b.id === "string" && Array.isArray(b.units) ? b : null;
}

export const audienceOf = (d: Deck): Audience => d.audience ?? "adults";

/** User decks take precedence over bundled decks with the same id. */
export function mergeDecks(bundled: Deck[], user: Deck[]): Deck[] {
  const ids = new Set(user.map((d) => d.id));
  return [...bundled.filter((d) => !ids.has(d.id)), ...user];
}

export const BACKUP_FORMAT = "echo-backup";

export function exportBackup(s: AppState): string {
  return JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), state: s }, null, 1);
}

export function parseBackup(text: string): AppState {
  let data: { format?: string; state?: Partial<AppState> };
  try {
    data = JSON.parse(text);
  } catch {
    throw new DeckError("Plik nie jest poprawnym JSON-em.");
  }
  if (data?.format !== BACKUP_FORMAT || !data.state) throw new DeckError("To nie jest kopia zapasowa Echo.");
  return migrate(data.state);
}

/** Fills in missing fields so older saves can still be loaded. */
export function migrate(raw: Partial<AppState> | null | undefined): AppState {
  const d = defaultState();
  if (!raw || typeof raw !== "object") return d;
  return {
    schema: 1,
    decks: Array.isArray(raw.decks) ? raw.decks : [],
    progress: raw.progress ?? {},
    log: raw.log ?? {},
    kids: { stars: raw.kids?.stars ?? 0, words: raw.kids?.words ?? {} },
    settings: { ...d.settings, ...(raw.settings ?? {}) },
  };
}
