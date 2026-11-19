import { useEffect, useMemo, useRef, useState } from "react";
import { leaveProfile } from "../App";
import { kidsWorlds, roundStars, type Island, type KidsWorld } from "../core/kids";
import { addTickets, finishGame, spendTicket, tickets, ticketsFor, wordsFor, type MiniGame } from "../core/games";
import type { Card, Deck } from "../core/types";
import { bundledBooks, decksFor, getState, update, useAppState } from "../state/store";
import { Icon } from "../ui/icons";
import { setSfxEnabled } from "../platform/sfx";
import { Game, type RoundResult } from "./Game";
import { IslandMap } from "./IslandMap";
import { Album, Reward } from "./Reward";
import { Balloons, GameEnd, GamePicker, Letters, Memory, Ticket } from "./Games";

type View =
  | { name: "shelf" | "map" | "album" }
  | { name: "game"; island: Island; round: number; asleep: string[] }
  | { name: "reward"; island: Island; result: RoundResult; round: number; asleep: string[]; ticket: boolean }
  | { name: "games"; decks: Deck[] }
  | { name: "mini"; game: MiniGame; words: Card[]; decks: Deck[]; n: number }
  | { name: "miniEnd"; game: MiniGame; stars: 1 | 2 | 3; decks: Deck[] };

const MINI = { memory: Memory, balloons: Balloons, letters: Letters };

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
          t.current = setTimeout(leaveProfile, 1300);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => e.key === "Enter" && leaveProfile()}
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
  const [worldId, setWorldId] = useState<string | null>(null);
  const decks = decksFor(s, "kids");
  setSfxEnabled(s.settings.sounds !== false);
  const worlds = useMemo(() => kidsWorlds(decks, bundledBooks, s, s.settings.kidsOpenAll === true), [decks, s]);
  // With one book there is nothing to choose: the map opens straight away.
  const world: KidsWorld | undefined = worlds.length === 1 ? worlds[0] : worlds.find((w) => w.id === worldId);
  const list = world?.islands ?? [];
  const sleeping = () => list.filter((i) => i.asleep).map((i) => i.id);

  const toMap = () => setView({ name: "map" });
  // A ticket buys one mini-game with words from the given decks.
  const play = (game: MiniGame, ds: Deck[]) => {
    if (tickets(getState()) <= 0) return;
    update(spendTicket);
    setView({ name: "mini", game, words: wordsFor(game, ds, getState()), decks: ds, n: Date.now() });
  };

  if (view.name === "game")
    return (
      <Game
        key={`${view.island.id}-${view.round}`}
        island={view.island}
        onExit={toMap}
        onDone={(result) => {
          const earned = ticketsFor(roundStars(result.won.length, result.firstTries.length));
          update((st) => addTickets(st, earned));
          setView({ name: "reward", island: view.island, result, round: view.round, asleep: view.asleep, ticket: earned > 0 });
        }}
      />
    );
  if (view.name === "reward")
    return <Reward result={view.result} before={view.island} after={list.find((i) => i.id === view.island.id) ?? view.island} woke={list.find((i) => view.asleep.includes(i.id) && !i.asleep)} stars={s.kids.stars} ticket={view.ticket} tickets={tickets(s)} onGames={() => setView({ name: "games", decks: [view.island.deck!] })} onAgain={() => setView({ name: "game", island: list.find((i) => i.id === view.island.id) ?? view.island, round: view.round + 1, asleep: sleeping() })} onMap={toMap} />;
  if (view.name === "games") return <GamePicker decks={view.decks} tickets={tickets(s)} onPlay={(g) => play(g, view.decks)} onBack={toMap} />;
  if (view.name === "mini") {
    const Mini = MINI[view.game];
    return <Mini key={view.n} words={view.words} onExit={toMap} onDone={(stars) => { update(finishGame); setView({ name: "miniEnd", game: view.game, stars, decks: view.decks }); }} />;
  }
  if (view.name === "miniEnd") return <GameEnd game={view.game} stars={view.stars} tickets={tickets(s)} onAgain={() => setView({ name: "games", decks: view.decks })} onMap={toMap} />;
  if (view.name === "album") return <Album islands={worlds.flatMap((w) => w.islands)} onBack={() => setView({ name: "map" })} />;

  const header = (title: string, back?: () => void) => (
    <header className="khdr">
      <ParentGate />
      {back && <button className="kround" onClick={back} aria-label="Wróć do książek"><Icon name="back" size={32} /></button>}
      <h1>{title}</h1>
      <span className="sp" />
      <Ticket n={tickets(s)} onClick={() => setView({ name: "games", decks: world ? world.islands.flatMap((i) => (i.deck ? [i.deck] : [])) : decks })} />
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
