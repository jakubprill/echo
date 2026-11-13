import { dayNumber, dayToDate } from "../core/date";
import { counts } from "../core/session";
import { buckets, lastDays, streak } from "../core/stats";
import { decksFor, useAppState } from "../state/store";
import { plural } from "./Home";

export function Progress() {
  const s = useAppState();
  const today = dayNumber();
  const decks = decksFor(s, "adults");
  const b = buckets(decks, s);
  const total = b.fresh + b.learning + b.young + b.mature;
  const days = lastDays(s, today, 14);
  const max = Math.max(1, ...days.map((d) => d.reviews));
  const sum = days.reduce((a, d) => a + d.reviews, 0);
  const logs = Object.values(s.log);
  const reviews = logs.reduce((a, l) => a + l.reviews, 0);
  const correct = logs.reduce((a, l) => a + l.correct, 0);
  const st = streak(s, today);
  const parts = [
    { k: "mature", n: b.mature, label: "opanowane" },
    { k: "young", n: b.young, label: "utrwalane" },
    { k: "learning", n: b.learning, label: "w nauce" },
    { k: "fresh", n: b.fresh, label: "nowe" },
  ];

  return (
    <div className="page">
      <header><h1>Postęp</h1><p className="sub">{total} {plural(total, "słówko", "słówka", "słówek")} w {decks.length} {plural(decks.length, "talii", "taliach", "taliach")}</p></header>
      <div className="stats">
        <div className="stat"><b>{st}</b><span>{plural(st, "dzień", "dni", "dni")} z rzędu</span></div>
        <div className="stat"><b>{reviews}</b><span>{plural(reviews, "powtórka", "powtórki", "powtórek")} łącznie</span></div>
        <div className="stat"><b>{reviews ? Math.round((correct / reviews) * 100) : 0}%</b><span>odpowiedzi „wiem”</span></div>
        <div className="stat"><b>{b.young + b.mature}</b><span>słówek z odstępem 3+ dni</span></div>
      </div>

      <section className="panel">
        <div className="label">Słówka według etapu</div>
        {total > 0 ? (
          <>
            <div className="stack" role="img" aria-label={parts.map((p) => `${p.label}: ${p.n}`).join(", ")}>
              {parts.filter((p) => p.n > 0).map((p) => <i key={p.k} className={`st-${p.k}`} style={{ flexGrow: p.n }} />)}
            </div>
            <ul className="legend">{parts.map((p) => <li key={p.k}><i className={`st-${p.k}`} /><b>{p.n}</b> {p.label}</li>)}</ul>
          </>
        ) : <p className="empty">Brak słówek. Wczytaj talię w zakładce Talie.</p>}
      </section>

      <section className="panel">
        <div className="label">Powtórki w ostatnich 14 dniach: {sum}</div>
        <div className="week week-long" role="img" aria-label={`Powtórki dzień po dniu: ${days.map((d) => d.reviews).join(", ")}`}>
          {days.map((d) => (
            <span key={d.day} className="week-col">
              <span className="week-n">{d.reviews || ""}</span>
              <i style={{ height: `${Math.max(d.reviews ? 8 : 0, (d.reviews / max) * 100)}%` }} />
              <span className="week-d">{dayToDate(d.day).getDate()}</span>
            </span>
          ))}
        </div>
      </section>

      {decks.length > 0 && (
        <section className="panel">
          <div className="label">Talie</div>
          <ul className="deck-rows">
            {decks.map((d) => {
              const c = counts([d], s, today);
              return (
                <li key={d.id}>
                  <span>{d.title}</span>
                  <span className="bar"><i style={{ width: `${(c.learned / c.total) * 100}%` }} /></span>
                  <small>{c.learned} / {c.total}</small>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
