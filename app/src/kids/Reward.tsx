import { useMemo } from "react";
import { playable, type Island } from "../core/kids";
import type { Card } from "../core/types";
import { say, useAppState } from "../state/store";
import { Bat } from "../ui/Bat";
import { Icon } from "../ui/icons";
import { Jar } from "./KidsApp";

const CONFETTI = ["var(--accent)", "var(--good)", "var(--again)", "var(--easy)", "var(--topic-school)"];

function wordsLabel(n: number): string {
  if (n === 1) return "1 słowo";
  const d = n % 10, h = n % 100;
  return `${n} ${d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? "słowa" : "słów"}`;
}

export function Reward({ won, stars, onAgain, onMap }: { won: Card[]; stars: number; onAgain: () => void; onMap: () => void }) {
  const confetti = useMemo(() => Array.from({ length: 44 }, (_, i) => ({ left: Math.random() * 100, dur: 1.6 + Math.random() * 1.6, delay: Math.random() * 0.6, color: CONFETTI[i % CONFETTI.length] })), []);
  return (
    <div className="kscreen">
      {won.length > 0 && <div className="confetti" aria-hidden="true">{confetti.map((c, i) => <i key={i} style={{ left: `${c.left}%`, background: c.color, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }} />)}</div>}
      <header className="khdr"><h1>{won.length > 0 ? "Brawo!" : "Dobra próba!"}</h1><span className="sp" /><Jar stars={stars} /></header>
      <div className="kreward">
        <div className="kreward-side">
          <Bat mood={won.length > 0 ? "happy" : "idle"} />
          <p className="ask">{won.length > 0 ? <>Echo zna już<br />{wordsLabel(won.length)}!</> : <>Spróbujmy<br />jeszcze raz!</>}</p>
        </div>
        <div className="stickers">
          {won.map((c, i) => (
            <button key={c.id} className="st" style={{ animationDelay: `${i * 0.12}s` }} onClick={() => say(c.en, 0.8)} aria-label={c.en}>
              <span>{c.emoji}</span><small lang="en">{c.en}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="kfoot kfoot-2">
        <button className="kbtn kbtn-quiet" onClick={onMap}><Icon name="map" size={32} /> Mapa</button>
        <button className="kbtn" onClick={onAgain}>Jeszcze raz ▶</button>
      </div>
    </div>
  );
}

export function Album({ islands, onBack }: { islands: Island[]; onBack: () => void }) {
  const s = useAppState();
  const open = islands.filter((i) => i.deck);
  return (
    <div className="kscreen">
      <header className="khdr">
        <button className="kround" onClick={onBack} aria-label="Wróć do mapy"><Icon name="map" size={32} /></button>
        <h1>Album</h1><span className="sp" /><Jar stars={s.kids.stars} />
      </header>
      <div className="kalbum">
        {open.map((isl) => (
          <section key={isl.id}>
            <h2>{isl.title} <small>{isl.stickers} / {isl.total}</small></h2>
            <div className="stickers stickers-album">
              {playable(isl.deck!).map((c) =>
                s.kids.words[c.id]?.sticker ? (
                  <button key={c.id} className="st" onClick={() => say(c.en, 0.8)} aria-label={c.en}><span>{c.emoji}</span><small lang="en">{c.en}</small></button>
                ) : (
                  <span key={c.id} className="st empty" aria-label="Pusta naklejka" />
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
