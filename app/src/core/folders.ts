import type { Book, Deck } from "./types";

/** A group of decks shown as one tile, e.g. a textbook with its units or a series of lessons. */
export type Folder = { id: string; title: string; decks: Deck[] };
export type DeckGroups = { folders: Folder[]; loose: Deck[] };

// "English 4 IT – 2. Databases": the part before the dash names the book or series.
const SEP = /\s+[–—-]\s+/;

const humanize = (slug: string) => slug.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * The folder a deck belongs to: its `folder` field if set, otherwise its book
 * (title from the book file, or the deck title's prefix, or the book id). Decks without either are loose.
 */
export function folderTitle(d: Deck, books: Book[] = []): string | null {
  if (d.folder) return d.folder;
  if (!d.book) return null;
  const book = books.find((b) => b.id === d.book);
  if (book) return book.title;
  const m = d.title.split(SEP);
  return m.length > 1 && m[0] ? m[0] : humanize(d.book);
}

export const folderId = (title: string) => title.trim().toLowerCase();

/** Deck title without the folder name, so "Hello Explorer 2 – Unit 1: Family" reads "Unit 1: Family" inside its folder. */
export function shortTitle(d: Deck, folder: string | null): string {
  if (!folder) return d.title;
  const parts = d.title.split(SEP);
  if (parts.length > 1 && folderId(parts[0]) === folderId(folder)) return parts.slice(1).join(" – ");
  return d.title;
}

/** Order inside a folder: the book's unit order when known, then units in natural order, then the original order. */
function unitRank(d: Deck, books: Book[]): number {
  const book = books.find((b) => b.id === d.book);
  const i = book ? book.units.findIndex((u) => u.id === d.unit) : -1;
  return i >= 0 ? i : Number.MAX_SAFE_INTEGER;
}

/** Splits decks into folders (in order of first appearance) and decks outside any folder. */
export function groupDecks(decks: Deck[], books: Book[] = []): DeckGroups {
  const folders: Folder[] = [];
  const loose: Deck[] = [];
  for (const d of decks) {
    const title = folderTitle(d, books);
    if (!title) {
      loose.push(d);
      continue;
    }
    const id = folderId(title);
    const f = folders.find((x) => x.id === id);
    if (f) f.decks.push(d);
    else folders.push({ id, title, decks: [d] });
  }
  for (const f of folders) {
    const pos = new Map(f.decks.map((d, i) => [d.id, i]));
    f.decks.sort(
      (a, b) =>
        unitRank(a, books) - unitRank(b, books) ||
        (a.unit && b.unit ? a.unit.localeCompare(b.unit, undefined, { numeric: true }) : 0) ||
        pos.get(a.id)! - pos.get(b.id)!,
    );
  }
  return { folders, loose };
}

/** Decks for a study session or quiz: one deck, one folder, or all of them. */
export function pickDecks(decks: Deck[], sel: { deckId?: string; folder?: string }, books: Book[] = []): Deck[] {
  if (sel.deckId) return decks.filter((d) => d.id === sel.deckId);
  if (sel.folder) return decks.filter((d) => {
    const t = folderTitle(d, books);
    return t !== null && folderId(t) === sel.folder;
  });
  return decks;
}
