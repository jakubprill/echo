import { useMemo, useRef, useState } from "react";
import { setLine } from "../App";
import { islands, type Island } from "../core/kids";
import type { Card } from "../core/types";
import { bundledBooks, decksFor, useAppState } from "../state/store";
import { Icon } from "../ui/icons";
import { Game } from "./Game";
import { IslandMap } from "./IslandMap";
import { Album, Reward } from "./Reward";

type View = { name: "map" | "album" } | { name: "game"; island: Island; round: number } | { name: "reward"; island: Island; won: Card[]; round: number };

export function Jar({ stars }: { stars: number }) {
  return <span className="jar" aria-label={`Gwiazdki: ${stars}`}><i />{stars}</span>;
}

/** Wyjście z trybu dziecka wymaga przytrzymania przycisku, żeby dziecko nie wyszło przypadkiem. */
function ParentGate() {
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [hold, setHold] = useState(false);
  const stop = () => {
    clearTimeout(t.current);
    setHold(false);
  };
  return (
    <button
      className={`kround gate${hold ? " hold" : ""}`}
      aria-label="Dla rodzica: przytrzymaj, aby wyjść z Echo Kids"
      onPointerDown={() => {
        setHold(true);
        t.current = setTimeout(() => setLine(null), 1300);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => e.key === "Enter" && setLine(null)}
    >
      <Icon name="user" size={32} />
    </button>
  );
}

export function KidsApp() {
  const s = useAppState();
  const [view, setView] = useState<View>({ name: "map" });
  const decks = decksFor(s, "kids");
  const list = useMemo(() => islands(decks, bundledBooks.filter((b) => decks.some((d) => d.book === b.id)), s), [decks, s]);

  if (view.name === "game")
    return <Game key={`${view.island.id}-${view.round}`} island={view.island} onExit={() => setView({ name: "map" })} onDone={(won) => setView({ name: "reward", island: view.island, won, round: view.round })} />;
  if (view.name === "reward")
    return <Reward won={view.won} stars={s.kids.stars} onAgain={() => setView({ name: "game", island: list.find((i) => i.id === view.island.id) ?? view.island, round: view.round + 1 })} onMap={() => setView({ name: "map" })} />;
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
        <IslandMap islands={list} onPlay={(island) => setView({ name: "game", island, round: 0 })} />
      )}
    </div>
  );
}
