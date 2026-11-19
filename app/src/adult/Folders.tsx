import { counts } from "../core/session";
import type { Folder } from "../core/folders";
import type { AppState } from "../core/types";
import { Icon } from "../ui/icons";
import { plural } from "./Home";

/** A folder tile: looks like a small stack of decks, opens the folder's deck list. */
export function FolderTile({ folder, s, today, kids, onOpen }: { folder: Folder; s: AppState; today: number; kids?: boolean; onOpen: () => void }) {
  const n = folder.decks.length;
  const words = folder.decks.reduce((a, d) => a + d.cards.length, 0);
  const c = counts(folder.decks, s, today);
  return (
    <button className="deck folder" onClick={onOpen} aria-label={`Folder ${folder.title}: ${n} ${plural(n, "talia", "talie", "talii")}`}>
      <span className="folder-top">
        <span className="folder-ic"><Icon name="folder" size={22} /></span>
        <span className="chip">{n} {plural(n, "talia", "talie", "talii")} · {words} {plural(words, "słówko", "słówka", "słówek")}</span>
      </span>
      <b>{folder.title}</b>
      {!kids && <span className="bar"><i style={{ width: `${c.total ? (c.learned / c.total) * 100 : 0}%` }} /></span>}
      <small>{kids ? "Echo Kids" : c.due > 0 ? `${c.due} do powtórki · ${c.learned} z ${c.total} w nauce` : `${c.learned} z ${c.total} w nauce`}</small>
    </button>
  );
}

/** Header of an opened folder: back button, title and an optional summary line. */
export function FolderHead({ folder, sub, onBack }: { folder: Folder; sub?: string; onBack: () => void }) {
  return (
    <header className="head-row">
      <button className="round" onClick={onBack} aria-label="Wróć do wszystkich talii"><Icon name="back" /></button>
      <div>
        <p className="crumb"><Icon name="folder" size={16} /> Folder</p>
        <h1>{folder.title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
    </header>
  );
}
