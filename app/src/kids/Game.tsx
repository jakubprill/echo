import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { applyKidsAnswer, buildRound, type Island } from "../core/kids";
import type { Card } from "../core/types";
import { getState, say, update, useAppState } from "../state/store";
import { sfx } from "../platform/sfx";
import { Bat, type BatMood } from "../ui/Bat";
import { Icon } from "../ui/icons";
import { Jar } from "./KidsApp";

const SLOW = 0.8;

export type RoundResult = { won: Card[]; firstTries: boolean[] };
type Flyer = { key: number; x: number; y: number; dx: number; dy: number };

export function Game({ island, onExit, onDone }: { island: Island; onExit: () => void; onDone: (r: RoundResult) => void }) {
  const s = useAppState();
  const round = useMemo(() => buildRound(island.deck!, getState()), [island]);
  const [intro, setIntro] = useState(0);
  const [qi, setQi] = useState(0);
  const [missed, setMissed] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const [mood, setMood] = useState<BatMood>("idle");
  const [streak, setStreak] = useState(0);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const won = useRef<Card[]>([]);
  const firstTries = useRef<boolean[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const inIntro = intro < round.intro.length;
  const q = round.questions[qi];

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const react = useCallback((m: BatMood) => {
    setMood(m);
    later(() => setMood("idle"), 1300);
  }, []);

  const listen = useCallback(
    (text: string) => {
      react("listen");
      say(text, SLOW);
    },
    [react],
  );

  // Echo speaks each new word and question by itself; tapping the bat repeats it.
  useEffect(() => {
    const text = inIntro ? round.intro[intro].en : q?.card.en;
    if (!text) return;
    const t = setTimeout(() => listen(text), 350);
    return () => clearTimeout(t);
  }, [intro, qi, inIntro, q, round, listen]);

  /** A star flies from the picked tile into the jar in the header. */
  const flyStar = (from: HTMLElement) => {
    const jar = document.querySelector(".kscreen .jar i");
    if (!jar) return;
    const a = from.getBoundingClientRect(), b = jar.getBoundingClientRect();
    const x = a.left + a.width / 2, y = a.top + a.height / 2;
    const f = { key: Date.now(), x, y, dx: b.left + b.width / 2 - x, dy: b.top + b.height / 2 - y };
    setFlyers((l) => [...l, f]);
    later(() => setFlyers((l) => l.filter((o) => o.key !== f.key)), 900);
  };

  const pick = (c: Card, el: HTMLElement) => {
    if (solved || !q) return;
    if (c.id === q.card.id) {
      const first = missed.length === 0;
      const run = first ? streak + 1 : 0;
      setSolved(true);
      setStreak(run);
      react("happy");
      if (first) {
        sfx.hit(run);
        flyStar(el);
      }
      say(first ? `Yes! ${c.en}` : c.en, SLOW);
      firstTries.current.push(first);
      if (first) won.current.push(c);
      // The jar counts up when the flying star lands; not cancelled on exit so the answer is always saved.
      setTimeout(() => update((st) => applyKidsAnswer(st, c.id, first)), first ? 700 : 0);
      later(() => {
        if (qi + 1 >= round.questions.length) onDone({ won: won.current, firstTries: firstTries.current });
        else {
          setQi(qi + 1);
          setMissed([]);
          setSolved(false);
        }
      }, 1500);
    } else if (!missed.includes(c.id)) {
      sfx.miss();
      setStreak(0);
      setMissed((m) => [...m, c.id]);
      react("think");
      later(() => say(q.card.en, SLOW), 600);
    }
  };

  const header = (
    <header className="khdr">
      <button className="kround" onClick={onExit} aria-label="Wróć do mapy"><Icon name="map" size={32} /></button>
      <h1>{island.title}</h1>
      <span className="sp" />
      <div className="dots" aria-label={inIntro ? `Nowe słowo ${intro + 1} z ${round.intro.length}` : `Pytanie ${qi + 1} z ${round.questions.length}`}>
        {(inIntro ? round.intro : round.questions).map((_, i) => <i key={i} className={i < (inIntro ? intro : qi) ? "on" : i === (inIntro ? intro : qi) ? "cur" : ""} />)}
      </div>
      {streak >= 2 && <span key={streak} className="combo" role="status">🔥 {streak}<span className="combo-l"> z rzędu!</span></span>}
      <Jar stars={s.kids.stars} />
    </header>
  );

  if (inIntro) {
    const c = round.intro[intro];
    return (
      <div className="kscreen">
        {header}
        <div className="kintro">
          <button className="kcard" onClick={() => listen(c.en)} aria-label={`Posłuchaj: ${c.en}`}>
            <span className="kcard-e">{c.emoji}</span>
            <span className="kcard-w" lang="en">{c.en}</span>
            <span className="kcard-pl">{c.pl}</span>
            <span className="kcard-say"><Icon name="speaker" size={32} /></span>
          </button>
          <div className="kintro-side">
            <button className="batbtn" onClick={() => listen(c.en)} aria-label="Echo powtarza słowo"><Bat mood={mood} /></button>
            <p className="ask">Nowe słowo!<small>Dotknij karty i posłuchaj</small></p>
            <button className="kbtn" onClick={() => setIntro(intro + 1)}>{intro + 1 < round.intro.length ? "Dalej ▶" : "Gramy! ▶"}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kscreen">
      {header}
      <div className="kgame">
        <div className="kgame-side">
          <button className="batbtn" onClick={() => listen(q.card.en)} aria-label="Posłuchaj jeszcze raz"><Bat mood={mood} /></button>
          <p className="ask">Gdzie jest<br /><span lang="en">{q.card.en}</span>?<small>Dotknij obrazka. Dotknij Echo, żeby posłuchać jeszcze raz</small></p>
        </div>
        <div className="picks">
          {q.options.map((o) => {
            const isTarget = o.id === q.card.id;
            const cls = solved && isTarget ? " ok" : missed.includes(o.id) ? " no" : missed.length > 0 && isTarget ? " show" : "";
            return (
              <button key={o.id} className={`pick${cls}`} onClick={(e) => pick(o, e.currentTarget)} aria-label={missed.length > 0 || solved ? o.en : "obrazek"}>
                <span>{o.emoji}</span>
              </button>
            );
          })}
        </div>
      </div>
      {flyers.map((f) => (
        <i key={f.key} className="flystar" aria-hidden="true" style={{ left: f.x, top: f.y, "--dx": `${f.dx}px`, "--dy": `${f.dy}px` } as CSSProperties} />
      ))}
    </div>
  );
}
