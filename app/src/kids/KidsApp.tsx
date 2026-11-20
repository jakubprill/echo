import { useMemo, useState } from "react";
import { WordPic } from "./WordPic";
import { KidsSwitch } from "./KidsSwitch";
import { kidsWorlds, roundStars, type Island, type KidsWorld } from "../core/kids";
import { addTickets, finishGame, spendTicket, tickets, ticketsFor, wordsFor, type MiniGame } from "../core/games";
import type { AppState, Card, Deck } from "../core/types";
import { bundledBooks, decksFor, getState, update, useAppState } from "../state/store";
import { Icon } from "../ui/icons";
import { setSfxEnabled } from "../platform/sfx";
import { canListen } from "../platform/listen";
import { Game, type RoundResult } from "./Game";
import { IslandMap, type LevelView } from "./IslandMap";
import { Album, Reward } from "./Reward";
import { levelSpellWords, levelStars, levelState, LEVELS, openedLevel, recordLevel, type Level, type LevelOptions } from "../core/levels";
import { Speak } from "./Speak";
import { Balloons, GameEnd, GamePicker, Letters, Memory, Ticket } from "./Games";

/**
 * A round is played on one of the island's three levels: 1 the tap game, 2 Literki with the island's
 * words, 3 "Mów z Echo". "Jeszcze raz" on the reward screen repeats the same level.
 */
type View =
  | { name: "shelf" | "map" | "album" }
  | { name: "game"; island: Island; level: Level; round: number; asleep: string[]; words?: Card[] }
  | { name: "reward"; island: Island; level: Level; result: RoundResult; rating: 1 | 2 | 3; opened: Level | null; round: number; asleep: string[]; ticket: boolean }
  | { name: "games"; decks: Deck[] }
  | { name: "mini"; game: MiniGame; words: Card[]; decks: Deck[]; n: number }
  | { name: "miniEnd"; game: MiniGame; stars: 1 | 2 | 3; decks: Deck[] };

const MINI = { memory: Memory, balloons: Balloons, letters: Letters };

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
  // "Mów z Echo" needs a parent's consent on the profile and a device that recognises speech.
  const voice = s.settings.kidsVoice === true && canListen();
  const levelOpt: LevelOptions = { voice, openAll: s.settings.kidsOpenAll === true };
  const levelsOf = (isl: Island) => Object.fromEntries(LEVELS.map((l) => [l, { state: levelState(s, isl, l, levelOpt), stars: levelStars(s, isl.id, l) }])) as Record<Level, LevelView>;
  const startLevel = (island: Island, level: Level, round = 0) =>
    setView({ name: "game", island, level, round, asleep: sleeping(), words: level === 2 ? levelSpellWords(island.deck!, getState()) : undefined });
  /** A finished level round: tickets as for any round, best level stars kept, and the level it opened (if any). */
  const finishLevel = (island: Island, level: Level, rating: 1 | 2 | 3, extra: (st: AppState) => AppState = (st) => st) => {
    const before = getState();
    const earned = ticketsFor(rating);
    update((st) => recordLevel(addTickets(extra(st), earned), island.id, level, rating));
    return { ticket: earned > 0, opened: openedLevel(before, getState(), island, levelOpt) };
  };

  const toMap = () => setView({ name: "map" });
  // A ticket buys one mini-game with words from the given decks.
  const play = (game: MiniGame, ds: Deck[]) => {
    if (tickets(getState()) <= 0) return;
    update(spendTicket);
    setView({ name: "mini", game, words: wordsFor(game, ds, getState()), decks: ds, n: Date.now() });
  };

  if (view.name === "game") {
    const { island, level, round } = view;
    if (level === 2)
      return (
        <Letters
          key={`${island.id}-2-${round}`}
          words={view.words ?? []}
          onExit={toMap}
          onDone={(rating) => {
            const words = view.words ?? [];
            const { ticket, opened } = finishLevel(island, 2, rating, finishGame);
            setView({ name: "reward", island, level, result: { won: words, firstTries: [] }, rating, opened, round, asleep: view.asleep, ticket });
          }}
        />
      );
    const Round = level === 3 ? Speak : Game;
    return (
      <Round
        key={`${island.id}-${level}-${round}`}
        island={island}
        onExit={toMap}
        onDone={(result) => {
          const rating = roundStars(result.won.length, result.firstTries.length);
          const { ticket, opened } = finishLevel(island, level, rating);
          setView({ name: "reward", island, level, result, rating, opened, round, asleep: view.asleep, ticket });
        }}
      />
    );
  }
  if (view.name === "reward") {
    const after = list.find((i) => i.id === view.island.id) ?? view.island;
    const spelled = view.level === 2 ? `${view.result.won.length} ${view.result.won.length === 1 ? "słowo ułożone" : view.result.won.length < 5 ? "słowa ułożone" : "słów ułożonych"}` : undefined;
    return (
      <Reward
        result={view.result}
        level={{ level: view.level, rating: view.rating, score: spelled, opened: view.opened, onNext: () => view.opened && startLevel(after, view.opened) }}
        before={view.island}
        after={after}
        woke={list.find((i) => view.asleep.includes(i.id) && !i.asleep)}
        stars={s.kids.stars}
        ticket={view.ticket}
        tickets={tickets(s)}
        onGames={() => setView({ name: "games", decks: [view.island.deck!] })}
        onAgain={() => startLevel(after, view.level, view.round + 1)}
        onMap={toMap}
      />
    );
  }
  if (view.name === "games") return <GamePicker decks={view.decks} tickets={tickets(s)} onPlay={(g) => play(g, view.decks)} onBack={toMap} />;
  if (view.name === "mini") {
    const Mini = MINI[view.game];
    return <Mini key={view.n} words={view.words} onExit={toMap} onDone={(stars) => { update(finishGame); setView({ name: "miniEnd", game: view.game, stars, decks: view.decks }); }} />;
  }
  if (view.name === "miniEnd") return <GameEnd game={view.game} stars={view.stars} tickets={tickets(s)} onAgain={() => setView({ name: "games", decks: view.decks })} onMap={toMap} />;
  if (view.name === "album") return <Album islands={worlds.flatMap((w) => w.islands)} onBack={() => setView({ name: "map" })} />;

  const header = (title: string, back?: () => void) => (
    <header className="khdr">
      <KidsSwitch />
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
        <IslandMap key={world?.id} islands={list} levels={levelsOf} onPlay={(island, level) => startLevel(island, level)} />
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
      <span className="kworld-e" aria-hidden="true">{playable[0] ? <WordPic card={{ emoji: playable[0].emoji, pic: playable[0].pic, en: playable[0].title }} /> : "🏝️"}</span>
      <b>{world.title}</b>
      <small>🏝️ {playable.length} · ⭐ {stickers}/{total}</small>
      <span className="lamps" aria-hidden="true">{playable.map((i) => <i key={i.id} className={i.lamps > 0 ? "on" : ""} />)}</span>
    </button>
  );
}
