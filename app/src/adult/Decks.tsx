import { useState } from "react";
import { audienceOf, DeckError, parseDeckFile } from "../core/deck";
import { dayNumber } from "../core/date";
import { counts } from "../core/session";
import type { Deck } from "../core/types";
import { pickTextFile } from "../platform/files";
import { allDecks, isBundled, say, update, useAppState } from "../state/store";
import { Icon } from "../ui/icons";
import type { Nav } from "./AdultApp";
import { plural } from "./Home";

/** Loads decks from a file and adds them to the state (a deck with the same id is replaced). */
export async function importDecks(): Promise<{ ok: boolean; text: string } | null> {
  const file = await pickTextFile();
  if (!file) return null;
  try {
    const decks = parseDeckFile(file.text);
    update((s) => {
      const ids = new Set(decks.map((d) => d.id));
      return { ...s, decks: [...s.decks.filter((d) => !ids.has(d.id)), ...decks] };
    });
    const n = decks.reduce((a, d) => a + d.cards.length, 0);
    const kids = decks.filter((d) => audienceOf(d) === "kids").length;
    return { ok: true, text: `Wczytano ${decks.length} ${plural(decks.length, "talię", "talie", "talii")} (${n} ${plural(n, "słówko", "słówka", "słówek")})${kids ? `. Talie dla dzieci (${kids}) są w Echo Kids.` : "."}` };
  } catch (e) {
    return { ok: false, text: e instanceof DeckError ? e.message : "Nie udało się wczytać pliku." };
  }
}

export function Decks({ nav }: { nav: Nav }) {
  const s = useAppState();
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const today = dayNumber();
  const all = allDecks(s);
  const adults = all.filter((d) => audienceOf(d) === "adults");
  const kids = all.filter((d) => audienceOf(d) === "kids");
  const deck = all.find((d) => d.id === open);

  if (deck) {
    const q = query.trim().toLowerCase();
    const cards = deck.cards.filter((c) => !q || c.en.toLowerCase().includes(q) || c.pl.toLowerCase().includes(q));
    const isKids = audienceOf(deck) === "kids";
    return (
      <div className="page">
        <header className="head-row">
          <button className="round" onClick={() => { setOpen(null); setQuery(""); setConfirm(false); }} aria-label="Wróć do listy talii"><Icon name="back" /></button>
          <div>
            <h1>{deck.title}</h1>
            <p className="sub">{[deck.level, deck.source].filter(Boolean).join(" · ")}</p>
          </div>
        </header>
        <div className="row">
          {!isKids && <button className="btn" onClick={() => nav({ name: "study", deckId: deck.id })}><Icon name="play" /> Ucz się</button>}
          {!isKids && <button className="btn btn-quiet" onClick={() => nav({ name: "quiz", deckId: deck.id })}><Icon name="quiz" /> Quiz</button>}
          {!isBundled(deck.id) && (confirm ? (
            <button className="btn btn-danger" onClick={() => { update((st) => ({ ...st, decks: st.decks.filter((d) => d.id !== deck.id) })); setOpen(null); setConfirm(false); }}>Na pewno usuń talię</button>
          ) : (
            <button className="btn btn-quiet" onClick={() => setConfirm(true)}><Icon name="trash" /> Usuń</button>
          ))}
        </div>
        <label className="search">
          <Icon name="search" size={20} />
          <input id="deck-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Szukaj słówka" aria-label="Szukaj słówka w talii" />
        </label>
        <ul className="words">
          {cards.map((c) => {
            const p = s.progress[c.id];
            return (
              <li key={c.id}>
                <button className="mini" onClick={() => say(c.en)} aria-label={`Posłuchaj: ${c.en}`}><Icon name="speaker" size={20} /></button>
                <span><b lang="en">{c.emoji ? `${c.emoji} ` : ""}{c.en}</b><span>{c.pl}</span></span>
                {!isKids && <small>{!p ? "nowe" : p.due <= today ? "do powtórki" : `za ${p.due - today} ${plural(p.due - today, "dzień", "dni", "dni")}`}</small>}
              </li>
            );
          })}
          {cards.length === 0 && <li className="empty">Nie ma takiego słówka w tej talii.</li>}
        </ul>
      </div>
    );
  }

  const tile = (d: Deck) => {
    const dc = counts([d], s, today);
    const isKids = audienceOf(d) === "kids";
    return (
      <button key={d.id} className="deck" onClick={() => setOpen(d.id)}>
        <span className="chip">{d.cards.length} {plural(d.cards.length, "słówko", "słówka", "słówek")}</span>
        <b>{d.title}</b>
        {!isKids && <span className="bar"><i style={{ width: `${(dc.learned / dc.total) * 100}%` }} /></span>}
        <small>{isKids ? "Echo Kids" : `${dc.learned} z ${dc.total} w nauce`}{isBundled(d.id) ? " · wbudowana" : ""}</small>
      </button>
    );
  };

  return (
    <div className="page">
      <header className="head-row head-split">
        <div>
          <h1>Talie</h1>
          <p className="sub">Talia to plik JSON w formacie echo-deck. Wczytaj jedną talię albo cały zestaw.</p>
        </div>
        <button className="btn" onClick={async () => setMsg(await importDecks())}><Icon name="import" /> Wczytaj z pliku</button>
      </header>
      {msg && <p className={`notice ${msg.ok ? "notice-ok" : "notice-no"}`} role="status">{msg.text}</p>}
      {adults.length === 0 && kids.length === 0 && <p className="empty">Nie ma jeszcze żadnej talii. Wczytaj plik, żeby zacząć naukę.</p>}
      {adults.length > 0 && <div className="decks">{adults.map(tile)}</div>}
      {kids.length > 0 && (
        <section>
          <h2>Dla dzieci</h2>
          <div className="decks">{kids.map(tile)}</div>
        </section>
      )}
    </div>
  );
}
