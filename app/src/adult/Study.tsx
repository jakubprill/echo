import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dayNumber } from "../core/date";
import { applyGrade, buildQueue, requeue, type StudyItem } from "../core/session";
import { intervalLabel, previewInterval } from "../core/sm2";
import type { Grade } from "../core/types";
import { decksFor, getState, say, update, useAppState } from "../state/store";
import { Icon } from "../ui/icons";
import type { Nav } from "./AdultApp";

const GRADES: { g: Grade; label: string; key: string }[] = [
  { g: "again", label: "Nie wiem", key: "1" },
  { g: "hard", label: "Trudne", key: "2" },
  { g: "good", label: "Dobrze", key: "3" },
  { g: "easy", label: "Łatwe", key: "4" },
];
const SWIPE = 110;

export function Study({ deckId, nav }: { deckId?: string; nav: Nav }) {
  const s = useAppState();
  // The queue is built once at the start of the session so grading does not reshuffle cards under the user's finger.
  const initial = useMemo(() => {
    const st = getState();
    return buildQueue(decksFor(st, "adults").filter((d) => !deckId || d.id === deckId), st, dayNumber());
  }, [deckId]);
  const [queue, setQueue] = useState<StudyItem[]>(initial);
  const [done, setDone] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState(0);
  const [leaving, setLeaving] = useState<null | "left" | "right" | "up">(null);
  const start = useRef<{ x: number; moved: boolean } | null>(null);
  const item = queue[0];
  const total = done + queue.length;

  const speakCard = useCallback(() => item && say(item.card.en), [item]);

  useEffect(() => {
    if (item && s.settings.autoSpeak && item.dir === "en-pl") say(item.card.en);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.card.id, queue.length]);

  const flip = useCallback(() => {
    setFlipped((f) => {
      if (!f && item?.dir === "pl-en" && getState().settings.autoSpeak) say(item.card.en);
      return !f;
    });
  }, [item]);

  const grade = useCallback(
    (g: Grade, dir: "left" | "right" | "up" = "up") => {
      if (!item || leaving) return;
      setLeaving(dir);
      setTimeout(() => {
        update((st) => applyGrade(st, item, g, dayNumber()));
        setQueue((q) => (g === "again" ? requeue(q.slice(1), item) : q.slice(1)));
        if (g !== "again") setDone((n) => n + 1);
        setFlipped(false);
        setDrag(0);
        setLeaving(null);
      }, 220);
    },
    [item, leaving],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        flip();
      } else if (flipped && "1234".includes(e.key)) grade(GRADES[Number(e.key) - 1].g);
      else if (e.key === "Escape") nav({ name: "home" });
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [flip, grade, flipped, nav]);

  if (!item) {
    return (
      <div className="study">
        <div className="finish">
          <span className="finish-mark"><Icon name="check" size={44} /></span>
          <h1>{done > 0 ? "Sesja skończona" : "Nic do powtórki"}</h1>
          <p className="sub">{done > 0 ? `Powtórzone karty: ${done}. Następne pojawią się zgodnie z harmonogramem.` : "W tej talii nie ma dziś kart do nauki. Dzienny limit nowych słówek zmienisz w Ustawieniach."}</p>
          <div className="row">
            <button className="btn" onClick={() => nav({ name: "home" })}>Wróć na start</button>
            <button className="btn btn-quiet" onClick={() => nav({ name: "quiz", deckId })}>Zrób quiz</button>
          </div>
        </div>
      </div>
    );
  }

  const { card, dir } = item;
  const p = s.progress[card.id];
  const front = dir === "en-pl" ? card.en : card.pl;
  const tilt = leaving === "left" ? -700 : leaving === "right" ? 700 : drag;
  const style = {
    transform: `translate(${tilt}px, ${leaving === "up" ? -40 : 0}px) rotate(${tilt / 30}deg)`,
    opacity: leaving ? 0 : 1,
    transition: start.current ? "none" : undefined,
  };

  return (
    <div className="study">
      <div className="top">
        <button className="round" onClick={() => nav({ name: "home" })} aria-label="Zakończ sesję"><Icon name="close" /></button>
        <div className="prog" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}><i style={{ width: `${(done / total) * 100}%` }} /></div>
        <span className="count">{done} / {total}</span>
        <button className="round" onClick={speakCard} aria-label="Posłuchaj wymowy"><Icon name="speaker" /></button>
      </div>

      <div className="cardzone">
        <div
          className="swipe"
          style={style}
          onPointerDown={(e) => {
            start.current = { x: e.clientX, moved: false };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!start.current) return;
            const dx = e.clientX - start.current.x;
            if (Math.abs(dx) > 8) start.current.moved = true;
            if (start.current.moved) setDrag(dx);
          }}
          onPointerUp={() => {
            const st = start.current;
            start.current = null;
            if (!st) return;
            if (!st.moved) flip();
            else if (drag > SWIPE) grade("good", "right");
            else if (drag < -SWIPE) grade("again", "left");
            else setDrag(0);
          }}
          onPointerCancel={() => {
            start.current = null;
            setDrag(0);
          }}
        >
          <div className={`fc${flipped ? " flip" : ""}`} role="button" tabIndex={0} aria-label={flipped ? "Odpowiedź. Dotknij, aby wrócić" : "Fiszka. Dotknij, aby odwrócić"}>
            <div className="face">
              <span className="tag tag-l" style={{ opacity: Math.max(0, -drag / SWIPE) }}>Nie wiem</span>
              <span className="tag tag-r" style={{ opacity: Math.max(0, drag / SWIPE) }}>Dobrze</span>
              {item.fresh && <span className="chip chip-new">nowe</span>}
              <div className="word" lang={dir === "en-pl" ? "en" : "pl"}>{front}</div>
              <div className="face-hint">{dir === "en-pl" ? "Co to znaczy?" : "Jak to powiedzieć po angielsku?"}</div>
            </div>
            <div className="face back">
              <span className="tag tag-l" style={{ opacity: Math.max(0, -drag / SWIPE) }}>Nie wiem</span>
              <span className="tag tag-r" style={{ opacity: Math.max(0, drag / SWIPE) }}>Dobrze</span>
              <div className="word word-sm" lang="en">{card.en}</div>
              <div className="tr">{card.pl}</div>
              {card.ex && <div className="ex" lang="en">{card.ex}</div>}
              {card.exPl && <div className="ex ex-pl">{card.exPl}</div>}
              {card.note && <div className="note">{card.note}</div>}
            </div>
          </div>
        </div>
      </div>

      {flipped ? (
        <div className="rate">
          {GRADES.map(({ g, label, key }) => (
            <button key={g} className={`rate-${g}`} onClick={() => grade(g)}>
              <span>{label}</span>
              <small>{intervalLabel(previewInterval(p, g))}</small>
              <kbd>{key}</kbd>
            </button>
          ))}
        </div>
      ) : (
        <div className="rate rate-reveal">
          <button className="btn" onClick={flip}>Pokaż odpowiedź</button>
          <p className="hint">Dotknij karty, aby odwrócić. Przesuń w prawo, gdy wiesz, w lewo, gdy nie.</p>
        </div>
      )}
    </div>
  );
}
