import { useEffect, useMemo, useState } from "react";
import { WordPic } from "./WordPic";
import { bestStreak, playable, roundStars, stickerTier, type Island } from "../core/kids";
import { sfx } from "../platform/sfx";
import { say, useAppState } from "../state/store";
import { Bat } from "../ui/Bat";
import { Icon } from "../ui/icons";
import type { RoundResult } from "./Game";
import { Jar } from "./KidsApp";

const CONFETTI = ["var(--accent)", "var(--good)", "var(--again)", "var(--easy)", "var(--topic-school)"];

function wordsLabel(n: number): string {
  if (n === 1) return "1 słowo";
  const d = n % 10, h = n % 100;
  return `${n} ${d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? "słowa" : "słów"}`;
}

const TITLES = ["", "Dobra próba!", "Brawo!", "Super runda!"];

export function Reward({ result, before, after, woke, stars, ticket, tickets, onGames, onAgain, onMap }: { result: RoundResult; before: Island; after: Island; woke?: Island; stars: number; ticket: boolean; tickets: number; onGames: () => void; onAgain: () => void; onMap: () => void }) {
  const s = useAppState();
  const { won, firstTries } = result;
  const rating = roundStars(won.length, firstTries.length);
  const streak = bestStreak(firstTries);
  const conquered = before.lamps < 3 && after.lamps >= 3;
  const newLamp = !conquered && after.lamps > before.lamps;
  const [shown, setShown] = useState(0);
  const confetti = useMemo(() => Array.from({ length: conquered ? 90 : 44 }, (_, i) => ({ left: Math.random() * 100, dur: 1.6 + Math.random() * 1.6, delay: Math.random() * (conquered ? 1.4 : 0.6), color: CONFETTI[i % CONFETTI.length] })), [conquered]);

  // The round's stars land one by one with a rising note, then a fanfare (and a sparkle for a new lamp).
  useEffect(() => {
    const t: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < rating; i++) t.push(setTimeout(() => { setShown(i + 1); sfx.star(i); }, 300 + i * 380));
    const end = 300 + rating * 380;
    if (rating >= 2) t.push(setTimeout(sfx.fanfare, end));
    if (conquered || newLamp || woke) t.push(setTimeout(sfx.sparkle, end + 700));
    return () => t.forEach(clearTimeout);
  }, [rating, conquered, newLamp, woke]);

  return (
    <div className="kscreen">
      {rating >= 2 && <div className="confetti" aria-hidden="true">{confetti.map((c, i) => <i key={i} style={{ left: `${c.left}%`, background: c.color, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }} />)}</div>}
      <header className="khdr"><h1>{conquered ? "Wyspa zdobyta!" : TITLES[rating]}</h1><span className="sp" /><Jar stars={stars} /></header>
      <div className="kreward">
        <div className="kreward-side">
          <Bat mood={shown === rating && rating >= 2 ? "happy" : "idle"} />
          <p className="ask">
            {streak >= 3 ? <>Najlepsza seria:<br />{streak} 🔥</> : won.length > 0 ? <>Echo zna już<br />{wordsLabel(won.length)}!</> : <>Spróbujmy<br />jeszcze raz!</>}
          </p>
        </div>
        <div className="kreward-main">
          <div className="rstars" role="img" aria-label={`Ocena rundy: ${rating} z 3 gwiazdek`}>
            {[0, 1, 2].map((i) => <i key={i} className={i < shown ? "on" : ""} />)}
          </div>
          <p className="rscore">{won.length} z {firstTries.length} za pierwszym razem</p>
          {(conquered || newLamp) && (
            <div className={`rlamp${conquered ? " big" : ""}`} role="status">
              <span className="lamps">{[0, 1, 2].map((k) => <i key={k} className={k < after.lamps ? "on" : ""} />)}</span>
              <b>{conquered ? `${after.title}: wszystkie lampki!` : "Nowa lampka na wyspie!"}</b>
            </div>
          )}
          {ticket && (
            <div className="rticket" role="status">
              <span aria-hidden="true">🎟️</span>
              <div><b>Bilet na minigrę!</b><small>Pary, Balony albo Literki</small></div>
            </div>
          )}
          {woke && (
            <div className="rwoke" role="status">
              <span><WordPic card={{ emoji: woke.emoji, pic: woke.pic, en: woke.title }} /></span>
              <div><b>Budzi się nowa wyspa!</b><small>{woke.title} czeka na Ciebie</small></div>
            </div>
          )}
          <div className="stickers">
            {won.map((c, i) => (
              <button key={c.id} className={`st tier-${stickerTier(s.kids.words[c.id])}`} style={{ animationDelay: `${0.4 + rating * 0.38 + i * 0.12}s` }} onClick={() => say(c.en, 0.8)} aria-label={c.en}>
                <span><WordPic card={c} /></span><small lang="en">{c.en}</small>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="kfoot kfoot-2">
        <button className="kbtn kbtn-quiet" onClick={onMap}><Icon name="map" size={32} /> Mapa</button>
        {tickets > 0 && <button className="kbtn kbtn-game" onClick={onGames}>Minigra 🎟️</button>}
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
        <h1>Album</h1><span className="sp" />
        <span className="tiers" aria-hidden="true"><i className="tier-1" />1×<i className="tier-2" />2×<i className="tier-3" />3×</span><Jar stars={s.kids.stars} />
      </header>
      <div className="kalbum">
        {open.map((isl) => (
          <section key={isl.id}>
            <h2>{isl.title} <small>{isl.stickers} / {isl.total}{isl.gold > 0 && ` · złote: ${isl.gold}`}</small></h2>
            <div className="stickers stickers-album">
              {playable(isl.deck!).map((c) =>
                s.kids.words[c.id]?.sticker ? (
                  <button key={c.id} className={`st tier-${stickerTier(s.kids.words[c.id])}`} onClick={() => say(c.en, 0.8)} aria-label={c.en}><span><WordPic card={c} /></span><small lang="en">{c.en}</small></button>
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
