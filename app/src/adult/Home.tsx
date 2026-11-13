import { dayNumber, dayToDate } from "../core/date";
import { counts } from "../core/session";
import { lastDays, streak } from "../core/stats";
import { decksFor, useAppState } from "../state/store";
import { Icon } from "../ui/icons";
import type { Nav } from "./AdultApp";

const DAYS = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];

export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10, h = n % 100;
  return d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? few : many;
}

export function Home({ nav }: { nav: Nav }) {
  const s = useAppState();
  const today = dayNumber();
  const decks = decksFor(s, "adults");
  const c = counts(decks, s, today);
  const todo = c.due + c.fresh;
  const week = lastDays(s, today, 7);
  const max = Math.max(1, ...week.map((d) => d.reviews));
  const st = streak(s, today);
  const date = new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
  const hour = new Date().getHours();

  return (
    <div className="page">
      <header>
        <h1>{hour < 18 ? "Dzień dobry" : "Dobry wieczór"}</h1>
        <p className="sub">{date.charAt(0).toUpperCase() + date.slice(1)}{st > 0 ? ` · seria ${st} ${plural(st, "dzień", "dni", "dni")}` : ""}</p>
      </header>

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
        <section>
          <h2>Talie</h2>
          <div className="decks">
            {decks.map((d) => {
              const dc = counts([d], s, today);
              const info = dc.due > 0 ? `${dc.due} do powtórki` : dc.learned < dc.total ? `${dc.total - dc.learned} ${plural(dc.total - dc.learned, "nowe", "nowe", "nowych")}` : "wszystko powtórzone";
              return (
                <button key={d.id} className="deck" onClick={() => nav({ name: "study", deckId: d.id })}>
                  <span className="chip">{d.cards.length} {plural(d.cards.length, "słówko", "słówka", "słówek")}</span>
                  <b>{d.title}</b>
                  <span className="bar"><i style={{ width: `${(dc.learned / dc.total) * 100}%` }} /></span>
                  <small>{info}</small>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
