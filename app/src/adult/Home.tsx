import { useState } from "react";
import { dayNumber, dayToDate } from "../core/date";
import { groupDecks, shortTitle, type Folder } from "../core/folders";
import { counts } from "../core/session";
import { lastDays, streak } from "../core/stats";
import { bundledBooks, decksFor, useAppState, useHousehold } from "../state/store";
import { activeProfile } from "../core/profiles";
import { Icon } from "../ui/icons";
import { VoiceNotice } from "../ui/VoiceNotice";
import { UpdateBanner } from "../ui/UpdateBanner";
import type { Nav } from "./AdultApp";
import { FolderTile } from "./Folders";
import type { Deck } from "../core/types";

const DAYS = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];

export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10, h = n % 100;
  return d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? few : many;
}

export function Home({ nav }: { nav: Nav }) {
  const s = useAppState();
  const me = activeProfile(useHousehold());
  const today = dayNumber();
  const decks = decksFor(s, "adults");
  const c = counts(decks, s, today);
  const todo = c.due + c.fresh;
  const week = lastDays(s, today, 7);
  const max = Math.max(1, ...week.map((d) => d.reviews));
  const st = streak(s, today);
  const date = new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
  const hour = new Date().getHours();
  const groups = groupDecks(decks, bundledBooks);
  const [folderId, setFolderId] = useState<string | null>(null);
  const folder: Folder | undefined = groups.folders.find((f) => f.id === folderId);

  const tile = (d: Deck, inFolder?: Folder) => {
    const dc = counts([d], s, today);
    const info = dc.due > 0 ? `${dc.due} do powtórki` : dc.learned < dc.total ? `${dc.total - dc.learned} ${plural(dc.total - dc.learned, "nowe", "nowe", "nowych")}` : "wszystko powtórzone";
    return (
      <button key={d.id} className="deck" onClick={() => nav({ name: "study", deckId: d.id })}>
        <span className="chip">{d.cards.length} {plural(d.cards.length, "słówko", "słówka", "słówek")}</span>
        <b>{inFolder ? shortTitle(d, inFolder.title) : d.title}</b>
        <span className="bar"><i style={{ width: `${(dc.learned / dc.total) * 100}%` }} /></span>
        <small>{info}</small>
      </button>
    );
  };

  return (
    <div className="page">
      <header>
        <h1>{hour < 18 ? "Dzień dobry" : "Dobry wieczór"}{me ? `, ${me.name}` : ""}</h1>
        <p className="sub">{date.charAt(0).toUpperCase() + date.slice(1)}{st > 0 ? ` · seria ${st} ${plural(st, "dzień", "dni", "dni")}` : ""}</p>
      </header>

      <UpdateBanner />
      <VoiceNotice />

      <div className="today">
        <section className="panel">
          <div className="label">Do nauki dziś</div>
          <div className="big">{todo}</div>
          <div className="split">
            <span><b>{c.due}</b>{plural(c.due, "powtórka", "powtórki", "powtórek")}</span>
            <span><b>{c.fresh}</b>{plural(c.fresh, "nowe", "nowe", "nowych")}</span>
            <span><b>~{Math.max(1, Math.round(todo * 0.3))} min</b>czas</span>
          </div>
          {decks.length === 0 ? (
            <button className="btn" onClick={() => nav({ name: "decks" })}><Icon name="import" /> Wczytaj talię</button>
          ) : todo > 0 ? (
            <button className="btn" onClick={() => nav({ name: "study" })}><Icon name="play" /> Ucz się</button>
          ) : (
            <div className="done-note"><Icon name="check" /> Na dziś wszystko. Możesz zrobić quiz.</div>
          )}
        </section>
        <section className="panel">
          <div className="label">Ostatnie 7 dni</div>
          <div className="week" role="img" aria-label={`Powtórki w ostatnich 7 dniach: ${week.map((d) => d.reviews).join(", ")}`}>
            {week.map((d) => (
              <span key={d.day} className="week-col">
                <span className="week-n">{d.reviews || ""}</span>
                <i style={{ height: `${Math.max(d.reviews ? 8 : 0, (d.reviews / max) * 100)}%` }} />
                <span className="week-d">{DAYS[dayToDate(d.day).getDay()]}</span>
              </span>
            ))}
          </div>
        </section>
      </div>

      {decks.length > 0 && (
        <section className="panel voice-entry">
          <span className="voice-entry-icon" aria-hidden="true"><Icon name="mic" size={30} /></span>
          <div>
            <b>Tryb głosowy</b>
            <p className="sub">Echo czyta słówka, Ty odpowiadasz na głos. Bez klikania, na przykład przy pracy.</p>
          </div>
          <button className="btn btn-quiet" onClick={() => nav({ name: "voice" })}><Icon name="mic" /> Ćwicz głosem</button>
        </section>
      )}

      {decks.length > 0 && (
        <section>
          {folder ? (
            <>
              <div className="head-row">
                <button className="round" onClick={() => setFolderId(null)} aria-label="Wróć do wszystkich talii"><Icon name="back" /></button>
                <div>
                  <p className="crumb"><Icon name="folder" size={16} /> Folder</p>
                  <h2 className="h2-inline">{folder.title}</h2>
                </div>
                <button className="btn" onClick={() => nav({ name: "study", folder: folder.id })}><Icon name="play" /> Ucz się z folderu</button>
              </div>
              <div className="decks">{folder.decks.map((d) => tile(d, folder))}</div>
            </>
          ) : (
            <>
              <h2>Talie</h2>
              <div className="decks">
                {groups.folders.map((f) => <FolderTile key={f.id} folder={f} s={s} today={today} onOpen={() => setFolderId(f.id)} />)}
                {groups.loose.map((d) => tile(d))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
