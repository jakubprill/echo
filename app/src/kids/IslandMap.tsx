import { useEffect, useRef, useState } from "react";
import type { Island } from "../core/kids";
import { Bat } from "../ui/Bat";

const COLORS = ["var(--topic-animals)", "var(--topic-food)", "var(--topic-toys)", "var(--topic-school)"];

/** Islands sit on a wavy path: x grows evenly, y alternates between two rows. */
function place(i: number, n: number): { x: number; y: number } {
  const x = n === 1 ? 50 : 9 + (i * 79) / (n - 1);
  const y = (i % 2 === 0 ? 30 : 68) + (i % 4 < 2 ? -3 : 3);
  return { x, y };
}

export function IslandMap({ islands, onPlay }: { islands: Island[]; onPlay: (i: Island) => void }) {
  const firstOpen = islands.findIndex((i) => i.deck && i.lamps < 3);
  const [sel, setSel] = useState(Math.max(0, firstOpen >= 0 ? firstOpen : islands.findIndex((i) => i.deck)));
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
              className={`isl${isl.deck ? "" : " lock"}${i === sel ? " cur" : ""}`}
              style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%`, background: COLORS[i % COLORS.length] }}
              onClick={() => isl.deck && setSel(i)}
              aria-disabled={!isl.deck}
              aria-pressed={i === sel}
              aria-label={isl.deck ? `Wyspa ${isl.title}, naklejki: ${isl.stickers} z ${isl.total}` : `Wyspa ${isl.title}, wkrótce`}
            >
              <span className="isl-e">{isl.deck ? isl.emoji : "🔒"}</span>
              <span className="lamps">{[0, 1, 2].map((k) => <i key={k} className={k < isl.lamps ? "on" : ""} />)}</span>
              <b>{isl.title}</b>
            </button>
          ))}
          <span className="mapbat" style={{ left: `${pos[sel].x}%`, top: `${pos[sel].y}%` }}><Bat /></span>
        </div>
      </div>
      <div className="kfoot">
        <div className="kfoot-info">
          <b>{cur.title}</b>
          <small>{cur.deck ? `${cur.stickers} z ${cur.total} naklejek` : "Ta wyspa jeszcze śpi"}</small>
        </div>
        <button className="kbtn" disabled={!cur.deck} onClick={() => onPlay(cur)}>Graj! ▶</button>
      </div>
    </>
  );
}
