import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { roundStars } from "../core/kids";
import { balloonWaves, canPlay, GAME_STARS, isPair, letterTiles, lettersStars, memoryBoard, memoryStars, MINI_GAMES, spellSlots, type MiniGame } from "../core/games";
import type { Card, Deck } from "../core/types";
import { say, useAppState } from "../state/store";
import { sfx } from "../platform/sfx";
import { Bat, type BatMood } from "../ui/Bat";
import { Icon } from "../ui/icons";
import { Jar } from "./KidsApp";
import { WordPic } from "./WordPic";

const SLOW = 0.8;

export const GAME_INFO: Record<MiniGame, { emoji: string; title: string; hint: string }> = {
  memory: { emoji: "🃏", title: "Pary", hint: "Znajdź obrazek i jego słowo" },
  balloons: { emoji: "🎈", title: "Balony", hint: "Przebij balon, który mówi Echo" },
  letters: { emoji: "🔤", title: "Literki", hint: "Ułóż słowo z literek" },
};

export function Ticket({ n, onClick }: { n: number; onClick?: () => void }) {
  const label = `Bilety na minigry: ${n}`;
  return onClick ? (
    <button className={`kticket${n > 0 ? " has" : ""}`} onClick={onClick} aria-label={label}><span aria-hidden="true">🎟️</span><b key={n}>{n}</b></button>
  ) : (
    <span className="kticket has" aria-label={label}><span aria-hidden="true">🎟️</span><b key={n}>{n}</b></span>
  );
}

/** Shared timers that are cleared when the game closes, and Echo's reactions. */
function useGameKit() {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [mood, setMood] = useState<BatMood>("idle");
  const later = useCallback((fn: () => void, ms: number) => void timers.current.push(setTimeout(fn, ms)), []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const react = useCallback(
    (m: BatMood) => {
      setMood(m);
      later(() => setMood("idle"), 1300);
    },
    [later],
  );
  const listen = useCallback(
    (text: string) => {
      react("listen");
      say(text, SLOW);
    },
    [react],
  );
  return { later, mood, react, listen };
}

function GameHeader({ title, onExit, progress }: { title: string; onExit: () => void; progress?: { at: number; of: number } }) {
  const s = useAppState();
  return (
    <header className="khdr">
      <button className="kround" onClick={onExit} aria-label="Wróć do mapy"><Icon name="map" size={32} /></button>
      <h1>{title}</h1>
      <span className="sp" />
      {progress && (
        <div className="dots" aria-label={`${progress.at + 1} z ${progress.of}`}>
          {Array.from({ length: progress.of }, (_, i) => <i key={i} className={i < progress.at ? "on" : i === progress.at ? "cur" : ""} />)}
        </div>
      )}
      <Jar stars={s.kids.stars} />
    </header>
  );
}

/** Choosing a game: each one costs a ticket; games without enough known words stay closed. */
export function GamePicker({ decks, tickets, onPlay, onBack }: { decks: Deck[]; tickets: number; onPlay: (g: MiniGame) => void; onBack: () => void }) {
  const s = useAppState();
  const open = useMemo(() => new Map(MINI_GAMES.map((g) => [g, canPlay(g, decks, s)])), [decks, s]);
  return (
    <div className="kscreen">
      <header className="khdr">
        <button className="kround" onClick={onBack} aria-label="Wróć do mapy"><Icon name="map" size={32} /></button>
        <h1>Minigry</h1>
        <span className="sp" />
        <Ticket n={tickets} />
        <Jar stars={s.kids.stars} />
      </header>
      <div className="kgames">
        <p className="kgames-note" role="status">
          {tickets > 0 ? <>Masz {tickets === 1 ? "1 bilet" : `${tickets} bilety`}. Wybierz grę!</> : <>Brak biletów. Zagraj rundę na 2 lub 3 gwiazdki, a dostaniesz bilet 🎟️</>}
        </p>
        <div className="kgames-list">
          {MINI_GAMES.map((g) => {
            const info = GAME_INFO[g];
            const ok = open.get(g) === true;
            return (
              <button key={g} className={`kgame-tile g-${g}`} disabled={!ok || tickets <= 0} onClick={() => onPlay(g)}>
                <span className="kgame-e" aria-hidden="true">{info.emoji}</span>
                <b>{info.title}</b>
                <small>{ok ? info.hint : "Poznaj najpierw kilka słówek"}</small>
                <span className="kgame-cost" aria-hidden="true">🎟️ 1</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** End of a mini-game: one to three stars and a few stars for the jar. */
export function GameEnd({ game, stars, tickets, onAgain, onMap }: { game: MiniGame; stars: 1 | 2 | 3; tickets: number; onAgain: () => void; onMap: () => void }) {
  const s = useAppState();
  const [shown, setShown] = useState(0);
  const confetti = useMemo(() => Array.from({ length: 50 }, (_, i) => ({ left: Math.random() * 100, dur: 1.6 + Math.random() * 1.6, delay: Math.random() * 0.8, color: ["var(--accent)", "var(--good)", "var(--again)", "var(--easy)"][i % 4] })), []);
  useEffect(() => {
    const t: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < stars; i++) t.push(setTimeout(() => { setShown(i + 1); sfx.star(i); }, 300 + i * 380));
    t.push(setTimeout(sfx.fanfare, 300 + stars * 380));
    return () => t.forEach(clearTimeout);
  }, [stars]);
  return (
    <div className="kscreen">
      <div className="confetti" aria-hidden="true">{confetti.map((c, i) => <i key={i} style={{ left: `${c.left}%`, background: c.color, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }} />)}</div>
      <header className="khdr"><h1>{GAME_INFO[game].title}: brawo!</h1><span className="sp" /><Ticket n={tickets} /><Jar stars={s.kids.stars} /></header>
      <div className="kreward">
        <div className="kreward-side">
          <Bat mood={shown === stars ? "happy" : "idle"} />
          <p className="ask">Świetna zabawa!</p>
        </div>
        <div className="kreward-main kgame-end">
          <div className="rstars" role="img" aria-label={`Ocena gry: ${stars} z 3 gwiazdek`}>
            {[0, 1, 2].map((i) => <i key={i} className={i < shown ? "on" : ""} />)}
          </div>
          <p className="rscore">+{GAME_STARS} ⭐ do słoika</p>
        </div>
      </div>
      <div className="kfoot kfoot-2">
        <button className="kbtn kbtn-quiet" onClick={onMap}><Icon name="map" size={32} /> Mapa</button>
        {tickets > 0 && <button className="kbtn" onClick={onAgain}>Inna gra 🎟️</button>}
      </div>
    </div>
  );
}

type Play = { words: Card[]; onExit: () => void; onDone: (stars: 1 | 2 | 3) => void };

/** Memory: turn two cards over and find a picture with its English word. Echo reads every card. */
export function Memory({ words, onExit, onDone }: Play) {
  const { later, mood, react, listen } = useGameKit();
  const board = useMemo(() => memoryBoard(words), [words]);
  const [open, setOpen] = useState<string[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [misses, setMisses] = useState(0);
  const [run, setRun] = useState(0);
  const [wrong, setWrong] = useState(false);
  const busy = open.length === 2;

  const tap = (key: string) => {
    const t = board.find((x) => x.key === key)!;
    if (busy || open.includes(key) || found.includes(t.card.id)) return;
    sfx.flip();
    listen(t.card.en);
    if (open.length === 0) return setOpen([key]);
    const first = board.find((x) => x.key === open[0])!;
    setOpen([open[0], key]);
    if (isPair(first, t)) {
      later(() => {
        const next = [...found, t.card.id];
        setFound(next);
        setOpen([]);
        setRun(run + 1);
        sfx.hit(run + 1);
        react("happy");
        if (next.length === words.length) later(() => onDone(memoryStars(misses, words.length)), 1300);
      }, 450);
    } else {
      setRun(0);
      setMisses(misses + 1);
      later(() => { setWrong(true); react("think"); }, 500);
      later(() => { setOpen([]); setWrong(false); }, 1300);
    }
  };

  const n = board.length;
  const cols = n <= 6 ? 3 : n <= 8 ? 4 : Math.ceil(n / 3);
  const pcols = n <= 8 ? 2 : 3;
  return (
    <div className="kscreen">
      <GameHeader title="Pary" onExit={onExit} />
      <div className="kgame">
        <div className="kgame-side">
          <span className="batbtn"><Bat mood={mood} /></span>
          <p className="ask">Znajdź pary!<small>Obrazek i jego słowo. Pary: {found.length} z {words.length}</small></p>
        </div>
        <div className="mboard" style={{ "--cols": cols, "--pcols": pcols, "--rows": Math.ceil(n / cols), "--prows": Math.ceil(n / pcols) } as CSSProperties}>
          {board.map((t) => {
            const up = open.includes(t.key) || found.includes(t.card.id);
            const cls = found.includes(t.card.id) ? " done" : wrong && open.includes(t.key) ? " no" : "";
            return (
              <button key={t.key} className={`mtile${up ? " up" : ""}${cls}`} onClick={() => tap(t.key)} aria-label={up ? t.card.en : "Zakryta karta"}>
                <span className="mtile-in">
                  <span className="mface mcover" aria-hidden="true" />
                  <span className="mface mshow">
                    {t.face === "pic" ? <WordPic card={t.card} /> : <span className={`mword${t.card.en.length > 7 ? " long" : ""}`} lang="en">{t.card.en}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const BALLOON_COLORS = ["#fb7185", "#60a5fa", "#34d399", "#c084fc"];

/** Balloons: Echo says a word, and the child pops the balloon with its picture. */
export function Balloons({ words, onExit, onDone }: Play) {
  const { later, mood, react, listen } = useGameKit();
  const waves = useMemo(() => balloonWaves(words), [words]);
  const [wi, setWi] = useState(0);
  const [missed, setMissed] = useState<string[]>([]);
  const [popped, setPopped] = useState(false);
  const [run, setRun] = useState(0);
  const firstTries = useRef(0);
  const w = waves[wi];

  useEffect(() => {
    const t = setTimeout(() => listen(w.target.en), 700);
    return () => clearTimeout(t);
  }, [w, listen]);

  const tap = (c: Card) => {
    if (popped) return;
    if (c.id === w.target.id) {
      const first = missed.length === 0;
      if (first) firstTries.current++;
      setPopped(true);
      setRun(first ? run + 1 : 0);
      sfx.pop();
      later(() => sfx.hit(first ? run + 1 : 1), 120);
      react("happy");
      say(c.en, SLOW);
      later(() => {
        if (wi + 1 >= waves.length) onDone(roundStars(firstTries.current, waves.length));
        else {
          setWi(wi + 1);
          setMissed([]);
          setPopped(false);
        }
      }, 1400);
    } else if (!missed.includes(c.id)) {
      sfx.miss();
      setRun(0);
      setMissed([...missed, c.id]);
      react("think");
      later(() => say(w.target.en, SLOW), 600);
    }
  };

  return (
    <div className="kscreen ksky">
      <GameHeader title="Balony" onExit={onExit} progress={{ at: wi, of: waves.length }} />
      <div className="kgame">
        <div className="kgame-side">
          <button className="batbtn" onClick={() => listen(w.target.en)} aria-label="Posłuchaj jeszcze raz"><Bat mood={mood} /></button>
          <p className="ask">Przebij<br /><span lang="en">{w.target.en}</span>!<small>Dotknij Echo, żeby posłuchać jeszcze raz</small></p>
        </div>
        <div className="bfield" key={wi} style={{ "--n": w.balloons.length } as CSSProperties}>
          {w.balloons.map((c, i) => {
            const isTarget = c.id === w.target.id;
            const cls = popped && isTarget ? " pop" : missed.includes(c.id) ? " no" : missed.length > 0 && isTarget ? " show" : "";
            return (
              <button key={c.id} className={`balloon${cls}`} style={{ "--i": i, "--c": BALLOON_COLORS[(i + wi) % BALLOON_COLORS.length] } as CSSProperties} onClick={() => tap(c)} aria-label={missed.length > 0 || popped ? c.en : "balon"}>
                <span className="balloon-b"><WordPic card={c} /></span>
                <span className="balloon-s" aria-hidden="true" />
                {popped && isTarget && <span className="burst" aria-hidden="true">{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ "--k": k } as CSSProperties} />)}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Letters: build the word from shuffled letter tiles, one letter after another. */
export function Letters({ words, onExit, onDone }: Play) {
  const { later, mood, react, listen } = useGameKit();
  const [wi, setWi] = useState(0);
  const c = words[wi];
  const slots = useMemo(() => spellSlots(c.en), [c]);
  const tiles = useMemo(() => letterTiles(c.en), [c]);
  const need = useMemo(() => slots.filter((x) => !x.given).map((x) => x.ch), [slots]);
  const [filled, setFilled] = useState(0);
  const [used, setUsed] = useState<number[]>([]);
  const [shake, setShake] = useState<number | null>(null);
  const [slips, setSlips] = useState(0);
  const misses = useRef(0);
  const done = filled >= need.length;

  useEffect(() => {
    const t = setTimeout(() => listen(c.en), 500);
    return () => clearTimeout(t);
  }, [c, listen]);

  const tap = (key: number, ch: string) => {
    if (done || used.includes(key)) return;
    if (ch === need[filled]) {
      const next = filled + 1;
      setUsed([...used, key]);
      setFilled(next);
      setSlips(0);
      sfx.letter(next);
      if (next >= need.length) {
        react("happy");
        later(() => { sfx.hit(3); say(c.en, SLOW); }, 250);
        later(() => {
          if (wi + 1 >= words.length) onDone(lettersStars(misses.current, words.length));
          else {
            setWi(wi + 1);
            setFilled(0);
            setUsed([]);
          }
        }, 1800);
      }
    } else {
      misses.current++;
      setSlips(slips + 1);
      setShake(key);
      sfx.miss();
      react("think");
      later(() => setShake(null), 450);
    }
  };

  // After two slips the next right letter glows.
  const hintKey = slips >= 2 ? tiles.find((t) => !used.includes(t.key) && t.ch === need[filled])?.key : undefined;
  let k = 0;
  return (
    <div className="kscreen">
      <GameHeader title="Literki" onExit={onExit} progress={{ at: wi, of: words.length }} />
      <div className="kgame">
        <div className="kgame-side">
          <button className="batbtn" onClick={() => listen(c.en)} aria-label="Posłuchaj jeszcze raz"><Bat mood={mood} /></button>
          <p className="ask">Ułóż słowo!<small>Dotykaj literek po kolei. Dotknij Echo, żeby posłuchać</small></p>
        </div>
        <div className="lgame">
          <button className={`lpic${done ? " ok" : ""}`} onClick={() => listen(c.en)} aria-label={`Posłuchaj: ${c.en}`}><WordPic card={c} /></button>
          <div className="lslots" lang="en" aria-label={done ? c.en : `Ułożone litery: ${filled} z ${need.length}`} style={{ "--len": slots.length } as CSSProperties}>
            {slots.map((sl, i) => {
              if (sl.given) return <span key={i} className="lslot given">{sl.ch === " " ? "" : sl.ch}</span>;
              const idx = k++;
              return <span key={i} className={`lslot${idx < filled ? " on" : idx === filled && !done ? " cur" : ""}`}>{idx < filled ? sl.ch : ""}</span>;
            })}
          </div>
          <div className="ltiles" lang="en">
            {tiles.map((t) => (
              <button key={`${wi}-${t.key}`} className={`ltile${used.includes(t.key) ? " used" : ""}${shake === t.key ? " no" : ""}${hintKey === t.key ? " show" : ""}`} onClick={() => tap(t.key, t.ch)} disabled={used.includes(t.key)} aria-label={t.ch}>
                {t.ch}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
