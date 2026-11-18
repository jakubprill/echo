import { useEffect, useMemo, useRef, useState } from "react";
import { setLine } from "../App";
import { islands, type Island } from "../core/kids";
import { bundledBooks, decksFor, useAppState } from "../state/store";
import { Icon } from "../ui/icons";
import { setSfxEnabled } from "../platform/sfx";
import { Game, type RoundResult } from "./Game";
import { IslandMap } from "./IslandMap";
import { Album, Reward } from "./Reward";

type View = { name: "map" | "album" } | { name: "game"; island: Island; round: number; asleep: string[] } | { name: "reward"; island: Island; result: RoundResult; round: number; asleep: string[] };

export function Jar({ stars }: { stars: number }) {
  return <span className="jar" aria-label={`Gwiazdki: ${stars}`}><i /><b key={stars}>{stars}</b></span>;
}

/** Leaving kids mode requires holding the button so a child does not exit by accident. */
function ParentGate() {
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [hold, setHold] = useState(false);
  const [tip, setTip] = useState(false);
  useEffect(() => () => { clearTimeout(t.current); clearTimeout(tipTimer.current); }, []);
  const stop = () => {
    if (!hold) return;
    clearTimeout(t.current);
    setHold(false);
    // A short tap explains the gesture instead of doing nothing.
    setTip(true);
    clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTip(false), 3500);
  };
  return (
    <span className="gate-wrap">
      <button
        className={`kround gate${hold ? " hold" : ""}`}
        aria-label="Dla rodzica: przytrzymaj, aby wyjść z Echo Kids"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          setHold(true);
          setTip(false);
          t.current = setTimeout(() => setLine(null), 1300);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => e.key === "Enter" && setLine(null)}
      >
        <Icon name="user" size={32} />
      </button>
      {tip && <span className="gate-tip" role="status">Rodzicu: przytrzymaj ten przycisk, aby wyjść z Echo Kids</span>}
    </span>
  );
}

export function KidsApp() {
  const s = useAppState();
  const [view, setView] = useState<View>({ name: "map" });
  const decks = decksFor(s, "kids");
  setSfxEnabled(s.settings.sounds !== false);
  const list = useMemo(() => islands(decks, bundledBooks.filter((b) => decks.some((d) => d.book === b.id)), s, s.settings.kidsOpenAll === true), [decks, s]);
  const sleeping = () => list.filter((i) => i.asleep).map((i) => i.id);

  if (view.name === "game")
    return <Game key={`${view.island.id}-${view.round}`} island={view.island} onExit={() => setView({ name: "map" })} onDone={(result) => setView({ name: "reward", island: view.island, result, round: view.round, asleep: view.asleep })} />;
  if (view.name === "reward")
    return <Reward result={view.result} before={view.island} after={list.find((i) => i.id === view.island.id) ?? view.island} woke={list.find((i) => view.asleep.includes(i.id) && !i.asleep)} stars={s.kids.stars} onAgain={() => setView({ name: "game", island: list.find((i) => i.id === view.island.id) ?? view.island, round: view.round + 1, asleep: sleeping() })} onMap={() => setView({ name: "map" })} />;
  if (view.name === "album") return <Album islands={list} onBack={() => setView({ name: "map" })} />;

  return (
    <div className="kscreen">
      <header className="khdr">
        <ParentGate />
        <h1>Twoje wyspy</h1>
        <span className="sp" />
        <button className="kround" onClick={() => setView({ name: "album" })} aria-label="Album z naklejkami"><Icon name="album" size={32} /></button>
        <Jar stars={s.kids.stars} />
      </header>
      {list.length === 0 ? (
        <div className="kempty">
          <p>Nie ma jeszcze wysp.</p>
          <small>Rodzic może wczytać talię dla dzieci w Echo: Talie, Wczytaj z pliku.</small>
        </div>
      ) : (
        <IslandMap islands={list} onPlay={(island) => setView({ name: "game", island, round: 0, asleep: sleeping() })} />
      )}
    </div>
  );
}
