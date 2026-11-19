import { useMemo, useState } from "react";
import { KidsSwitch } from "./KidsSwitch";
import { kidsWorlds, type Island, type KidsWorld } from "../core/kids";
import { bundledBooks, decksFor, useAppState } from "../state/store";
import { Icon } from "../ui/icons";
import { setSfxEnabled } from "../platform/sfx";
import { Game, type RoundResult } from "./Game";
import { IslandMap } from "./IslandMap";
import { Album, Reward } from "./Reward";

type View = { name: "shelf" | "map" | "album" } | { name: "game"; island: Island; round: number; asleep: string[] } | { name: "reward"; island: Island; result: RoundResult; round: number; asleep: string[] };

export function Jar({ stars }: { stars: number }) {
  return <span className="jar" aria-label={`Gwiazdki: ${stars}`}><i /><b key={stars}>{stars}</b></span>;
}

export function KidsApp() {
  const s = useAppState();
  const [view, setView] = useState<View>({ name: "map" });
  const [worldId, setWorldId] = useState<string | null>(null);
  const decks = decksFor(s, "kids");
  setSfxEnabled(s.settings.sounds !== false);
  const worlds = useMemo(() => kidsWorlds(decks, bundledBooks, s, s.settings.kidsOpenAll === true), [decks, s]);
  // With one book there is nothing to choose: the map opens straight away.
  const world: KidsWorld | undefined = worlds.length === 1 ? worlds[0] : worlds.find((w) => w.id === worldId);
  const list = world?.islands ?? [];
  const sleeping = () => list.filter((i) => i.asleep).map((i) => i.id);

  if (view.name === "game")
    return <Game key={`${view.island.id}-${view.round}`} island={view.island} onExit={() => setView({ name: "map" })} onDone={(result) => setView({ name: "reward", island: view.island, result, round: view.round, asleep: view.asleep })} />;
  if (view.name === "reward")
    return <Reward result={view.result} before={view.island} after={list.find((i) => i.id === view.island.id) ?? view.island} woke={list.find((i) => view.asleep.includes(i.id) && !i.asleep)} stars={s.kids.stars} onAgain={() => setView({ name: "game", island: list.find((i) => i.id === view.island.id) ?? view.island, round: view.round + 1, asleep: sleeping() })} onMap={() => setView({ name: "map" })} />;
  if (view.name === "album") return <Album islands={worlds.flatMap((w) => w.islands)} onBack={() => setView({ name: "map" })} />;

  const header = (title: string, back?: () => void) => (
    <header className="khdr">
      <KidsSwitch />
      {back && <button className="kround" onClick={back} aria-label="Wróć do książek"><Icon name="back" size={32} /></button>}
      <h1>{title}</h1>
      <span className="sp" />
      <button className="kround" onClick={() => setView({ name: "album" })} aria-label="Album z naklejkami"><Icon name="album" size={32} /></button>
      <Jar stars={s.kids.stars} />
    </header>
  );

  if (!world && worlds.length > 1)
    return (
      <div className="kscreen">
        {header("Dokąd lecimy?")}
        <div className="kshelf">
          {worlds.map((w) => <WorldTile key={w.id} world={w} onOpen={() => setWorldId(w.id)} />)}
        </div>
      </div>
    );

  return (
    <div className="kscreen">
      {header(worlds.length > 1 && world ? world.title : "Twoje wyspy", worlds.length > 1 ? () => setWorldId(null) : undefined)}
      {list.length === 0 ? (
        <div className="kempty">
          <p>Nie ma jeszcze wysp.</p>
          <small>Rodzic może wczytać talię dla dzieci w Echo: Talie, Wczytaj z pliku.</small>
        </div>
      ) : (
        <IslandMap key={world?.id} islands={list} onPlay={(island) => setView({ name: "game", island, round: 0, asleep: sleeping() })} />
      )}
    </div>
  );
}

/** A book on the shelf: big touch target with the first island's picture and the stickers collected so far. */
function WorldTile({ world, onOpen }: { world: KidsWorld; onOpen: () => void }) {
  const playable = world.islands.filter((i) => i.deck);
  const stickers = playable.reduce((a, i) => a + i.stickers, 0);
  const total = playable.reduce((a, i) => a + i.total, 0);
  return (
    <button className="kworld" onClick={onOpen} aria-label={`${world.title}: wyspy ${playable.length}, naklejki ${stickers} z ${total}`}>
      <span className="kworld-e" aria-hidden="true">{playable[0]?.emoji ?? "🏝️"}</span>
      <b>{world.title}</b>
      <small>🏝️ {playable.length} · ⭐ {stickers}/{total}</small>
      <span className="lamps" aria-hidden="true">{playable.map((i) => <i key={i.id} className={i.lamps > 0 ? "on" : ""} />)}</span>
    </button>
  );
}
