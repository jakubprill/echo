import { useEffect, useRef, useState } from "react";
import { wakeNeed, type Island } from "../core/kids";
import { plural } from "../adult/Home";
import { Bat } from "../ui/Bat";
import { Icon } from "../ui/icons";

const COLORS = ["var(--topic-animals)", "var(--topic-food)", "var(--topic-toys)", "var(--topic-school)"];

/** Islands sit on a wavy path: x grows evenly, y alternates between two rows. */
function place(i: number, n: number): { x: number; y: number } {
  const x = n === 1 ? 50 : (i * 100) / (n - 1);
  const y = (i % 2 === 0 ? 30 : 68) + (i % 4 < 2 ? -3 : 3);
  return { x, y };
}

/** What the footer says about the selected island, so the child knows what to do next. */
function hint(list: Island[], i: number): string {
  const isl = list[i];
  if (!isl.deck) return "Tu jeszcze nie ma słówek. Wkrótce!";
  const need = wakeNeed(list, i);
  if (need) return `Wyspa śpi. Zbierz jeszcze ${need.stickers} ${plural(need.stickers, "naklejkę", "naklejki", "naklejek")} na wyspie ${need.from.title}, żeby ją obudzić`;
  if (isl.asleep) return "Wyspa śpi. Zapal lampkę na poprzedniej wyspie, żeby ją obudzić";
  return `${isl.stickers} z ${isl.total} naklejek`;
}

/** `onSpeak` (the voice round) is offered only when a parent turned the microphone on and the device can listen. */
export function IslandMap({ islands, onPlay, onSpeak }: { islands: Island[]; onPlay: (i: Island) => void; onSpeak?: (i: Island) => void }) {
  const open = (i: Island) => !!i.deck && !i.asleep;
  // Start at the newest awake island that is not finished yet.
  let firstOpen = -1;
  islands.forEach((isl, i) => { if (open(isl) && isl.lamps < 3) firstOpen = i; });
  const [sel, setSel] = useState(Math.max(0, firstOpen >= 0 ? firstOpen : islands.findIndex(open)));
  const cur = islands[sel];
  const pos = islands.map((_, i) => place(i, islands.length));
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (pos[sel].x / 100) * el.scrollWidth - el.clientWidth / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="kmap-scroll" ref={scroller}>
        <div className="kmap" style={{ minWidth: `max(${islands.length * 11}vmin, ${islands.length * 84}px)` }}>
          <span className="moon" />
          <svg className="kpath" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={pos.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#6d68c9" strokeWidth="0.8" strokeDasharray="0.6 2.2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {islands.map((isl, i) => (
            <button
              key={isl.id}
              className={`isl${open(isl) ? "" : " lock"}${isl.lamps >= 3 ? " done" : ""}${i === sel ? " cur" : ""}`}
              style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%`, background: COLORS[i % COLORS.length] }}
              onClick={() => setSel(i)}
              aria-disabled={!open(isl)}
              aria-pressed={i === sel}
              aria-label={!isl.deck ? `Wyspa ${isl.title}, jeszcze bez słówek` : isl.asleep ? `Wyspa ${isl.title}, śpi` : `Wyspa ${isl.title}, naklejki: ${isl.stickers} z ${isl.total}`}
            >
              <span className="isl-e">{!isl.deck ? "🔒" : isl.asleep ? "💤" : isl.emoji}</span>
              {isl.lamps >= 3 && <span className="isl-flag" aria-hidden="true">🚩</span>}
              <span className="lamps">{[0, 1, 2].map((k) => <i key={k} className={k < isl.lamps ? "on" : ""} />)}</span>
              <b>{isl.title}</b>
            </button>
          ))}
          <span className="mapbat" style={{ left: `${pos[sel].x}%`, top: `${pos[sel].y}%` }}><Bat /></span>
        </div>
      </div>
      <div className={`kfoot${onSpeak ? " kfoot-two" : ""}`}>
        <div className="kfoot-info">
          <b>{cur.title}</b>
          <small>{hint(islands, sel)}</small>
        </div>
        <div className="kfoot-play">
          {onSpeak && <button className="kbtn kbtn-speak" disabled={!open(cur)} onClick={() => onSpeak(cur)} aria-label="Mów z Echo"><Icon name="mic" size={32} /> Mów</button>}
          <button className="kbtn" disabled={!open(cur)} onClick={() => onPlay(cur)}>Graj! ▶</button>
        </div>
      </div>
    </>
  );
}
