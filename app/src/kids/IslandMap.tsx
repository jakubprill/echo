import { useEffect, useRef, useState } from "react";
import { wakeNeed, type Island } from "../core/kids";
import { plural } from "../adult/Home";
import { Bat } from "../ui/Bat";
import { LEVELS, type Level, type LevelState } from "../core/levels";

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

/** The three levels of an island: the same words, a harder skill each time. */
export const LEVEL_INFO: Record<Level, { icon: string; title: string }> = {
  1: { icon: "👆", title: "Pokaż" },
  2: { icon: "🔤", title: "Literki" },
  3: { icon: "🎤", title: "Powiedz" },
};

/** One level of the selected island as the map shows it: whether it can be played and its best stars. */
export type LevelView = { state: LevelState; stars: number };

/** Why a level cannot be played yet, said in the footer when the child taps it. */
function levelHint(level: Level, view: LevelView, levels: Record<Level, LevelView>, island: Island): string {
  if (view.state === "off") return level === 3 ? "Poproś rodzica, żeby włączył mikrofon dla Echo" : "Na tej wyspie słówka są za długie na Literki";
  if (island.asleep) return "Wyspa śpi. Najpierw ją obudź";
  const prev = ([1, 2] as Level[]).filter((l) => l < level && levels[l].state !== "off").pop() ?? 1;
  return `Zdobądź 2 gwiazdki na poziomie ${prev} (${LEVEL_INFO[prev].title}), a otworzy się poziom ${level}`;
}

/**
 * The island map. Under it, the selected island's three levels: tapping an open level starts it,
 * tapping a closed one explains in the footer what opens it.
 */
export function IslandMap({ islands, levels, onPlay }: { islands: Island[]; levels: (i: Island) => Record<Level, LevelView>; onPlay: (i: Island, level: Level) => void }) {
  const open = (i: Island) => !!i.deck && !i.asleep;
  // Start at the newest awake island that is not finished yet.
  let firstOpen = -1;
  islands.forEach((isl, i) => { if (open(isl) && isl.lamps < 3) firstOpen = i; });
  const [sel, setSel] = useState(Math.max(0, firstOpen >= 0 ? firstOpen : islands.findIndex(open)));
  const cur = islands[sel];
  const lv = levels(cur);
  // A tapped closed level explains itself until another island is chosen.
  const [why, setWhy] = useState<string | null>(null);
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
              onClick={() => { setSel(i); setWhy(null); }}
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
      <div className="kfoot kfoot-levels">
        <div className="kfoot-info">
          <b>{cur.title}</b>
          <small role="status">{why ?? hint(islands, sel) + (cur.deck && !cur.asleep ? ` · poziomy: ${LEVELS.filter((l) => lv[l].state !== "off" && lv[l].stars >= 2).length} z ${LEVELS.filter((l) => lv[l].state !== "off").length}` : "")}</small>
        </div>
        <div className="klevels" role="group" aria-label="Poziomy wyspy">
          {LEVELS.map((l) => {
            const v = lv[l];
            const playable = open(cur) && v.state === "open";
            return (
              <button
                key={l}
                className={`klevel lv${l}${playable ? "" : " lock"}${v.state === "off" ? " off" : ""}${v.stars >= 2 ? " won" : ""}`}
                aria-disabled={!playable}
                aria-label={`Poziom ${l}: ${LEVEL_INFO[l].title}${playable ? `, gwiazdki: ${v.stars} z 3` : ", zamknięty"}`}
                onClick={() => (playable ? onPlay(cur, l) : setWhy(cur.deck ? levelHint(l, v, lv, cur) : null))}
              >
                <span className="klevel-n" aria-hidden="true">{l}</span>
                <span className="klevel-e" aria-hidden="true">{v.state === "open" || !cur.deck ? LEVEL_INFO[l].icon : "🔒"}</span>
                <b>{LEVEL_INFO[l].title}</b>
                <span className="klevel-stars" aria-hidden="true">{[0, 1, 2].map((k) => <i key={k} className={k < v.stars ? "on" : ""} />)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
