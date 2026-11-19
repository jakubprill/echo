// "Mów z Echo": the kids' voice round. New words are repeated after Echo, then every word of the
// round is named from its picture. A miss brings a hint, then repeating after Echo; nothing the
// recogniser gets wrong can stop the child. The rules live in core/kidsVoice.ts.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { applyKidsAnswer, buildRound, playable, type Island } from "../core/kids";
import { askText, hint, judgeKid, onlyFillers, startWord, step as nextStep, type Outcome, type WordState } from "../core/kidsVoice";
import type { Card } from "../core/types";
import { keepScreenOn, listen, stopListening, type ListenError } from "../platform/listen";
import { sfx } from "../platform/sfx";
import { speakAndWait, stopSpeaking } from "../platform/tts";
import { getState, update, useAppState } from "../state/store";
import { Bat, type BatMood } from "../ui/Bat";
import { Icon } from "../ui/icons";
import type { RoundResult } from "./Game";
import { Jar } from "./KidsApp";

const SLOW = 0.8;

type Task = { card: Card; intro: boolean };
type Phase = "speaking" | "listening" | "right" | "miss" | "waiting" | "error";
type Flyer = { key: number; x: number; y: number; dx: number; dy: number };

/** What the child sees when the microphone cannot work; a parent has to help. */
const PROBLEMS: Record<ListenError, string> = {
  permission: "Echo nie może słuchać, bo nie ma zgody na mikrofon. Poproś rodzica o pomoc.",
  unavailable: "To urządzenie nie umie rozpoznawać mowy. Poproś rodzica o pomoc.",
  network: "Echo nie słyszy, bo nie ma internetu. Poproś rodzica o pomoc.",
  language: "Echo nie zna jeszcze angielskiego na tym urządzeniu. Poproś rodzica o pomoc.",
  busy: "Mikrofon jest teraz zajęty. Spróbuj jeszcze raz.",
  other: "Coś przeszkodziło w słuchaniu. Spróbuj jeszcze raz.",
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

export function Speak({ island, onExit, onDone }: { island: Island; onExit: () => void; onDone: (r: RoundResult) => void }) {
  const s = useAppState();
  const round = useMemo(() => buildRound(island.deck!, getState()), [island]);
  const others = useMemo(() => playable(island.deck!), [island]);
  const tasks = useMemo<Task[]>(() => [...round.intro.map((card) => ({ card, intro: true })), ...round.questions.map((q) => ({ card: q.card, intro: false }))], [round]);

  const [idx, setIdx] = useState(0);
  const [ws, setWs] = useState<WordState>(() => startWord(tasks[0]?.intro ? "repeat" : "say"));
  const [phase, setPhaseState] = useState<Phase>("speaking");
  const [problem, setProblem] = useState("");
  const [heard, setHeard] = useState("");
  const [mood, setMood] = useState<BatMood>("idle");
  const [streak, setStreak] = useState(0);
  const [flyers, setFlyers] = useState<Flyer[]>([]);

  const at = useRef({ idx: 0, ws: startWord(tasks[0]?.intro ? "repeat" : "say") });
  const phaseRef = useRef<Phase>("speaking");
  const ctl = useRef<AbortController | null>(null);
  const won = useRef<Card[]>([]);
  const firstTries = useRef<boolean[]>([]);
  const run = useRef(0);
  const pic = useRef<HTMLSpanElement>(null);

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const moveTo = (i: number, w: WordState) => {
    at.current = { idx: i, ws: w };
    setIdx(i);
    setWs(w);
  };
  const en = (text: string, signal: AbortSignal) => {
    const st = getState().settings;
    return speakAndWait(text, { language: st.accent, voiceId: st.voiceId, rate: SLOW, signal });
  };
  // Without a Polish voice these lines stay silent; the same words are on the screen.
  const pl = (text: string, signal: AbortSignal) => speakAndWait(text, { polish: true, signal });

  const halt = () => {
    ctl.current?.abort();
    ctl.current = null;
    stopListening();
    stopSpeaking();
  };

  /** Stops and waits for the child to tap Echo (after silence, or when the app was in the background). */
  const wait = () => {
    halt();
    setMood("idle");
    setPhase("waiting");
    void keepScreenOn(false);
  };

  /** A star flies from the picture into the jar in the header. */
  const flyStar = () => {
    const jar = document.querySelector(".kscreen .jar i");
    const from = pic.current;
    if (!jar || !from) return;
    const a = from.getBoundingClientRect(), b = jar.getBoundingClientRect();
    const x = a.left + a.width / 2, y = a.top + a.height / 2;
    const f = { key: Date.now(), x, y, dx: b.left + b.width / 2 - x, dy: b.top + b.height / 2 - y };
    setFlyers((l) => [...l, f]);
    setTimeout(() => setFlyers((l) => l.filter((o) => o.key !== f.key)), 900);
  };

  /** Records how a word of the round ended (introductions only teach, they do not count). */
  const settle = (task: Task, outcome: Outcome) => {
    if (task.intro) return;
    const first = outcome === "first";
    firstTries.current.push(first);
    if (first) won.current.push(task.card);
    update((st) => applyKidsAnswer(st, task.card.id, first));
    run.current = first ? run.current + 1 : 0;
    setStreak(run.current);
  };

  /** Says what the current rung of the ladder needs: the question, the hint or the word to repeat. */
  const prompt = async (task: Task, w: WordState, signal: AbortSignal) => {
    setPhase("speaking");
    setMood("idle");
    if (w.step === "repeat") {
      await pl(task.intro ? "Nowe słowo! Powtórz za mną:" : "Powtórz za mną:", signal);
      await en(task.card.en, signal);
    } else if (w.step === "hint") {
      await pl(`Podpowiedź. Zaczyna się na ${task.card.en.trim()[0]}.`, signal);
    } else {
      await pl(askText(task.card), signal);
    }
  };

  const loop = async (signal: AbortSignal) => {
    let quiet = 0, failures = 0, again = true;
    while (!signal.aborted) {
      const { idx: i, ws: w } = at.current;
      const task = tasks[i];
      if (!task) {
        halt();
        void keepScreenOn(false);
        return onDone({ won: won.current, firstTries: firstTries.current });
      }
      if (again) await prompt(task, w, signal);
      if (signal.aborted) return;
      again = true;
      setHeard("");
      setPhase("listening");
      setMood("listen");
      sfx.mic();
      const r = await listen(getState().settings.accent, { signal, onPartial: setHeard });
      if (signal.aborted || r.kind === "aborted") return;
      if (r.kind === "error") {
        if ((r.reason === "busy" || r.reason === "other") && ++failures < 3) {
          await sleep(800, signal);
          again = false;
          continue;
        }
        halt();
        setProblem(PROBLEMS[r.reason]);
        setPhase("error");
        void keepScreenOn(false);
        return;
      }
      failures = 0;
      if (r.kind === "silence" || onlyFillers(r.texts)) {
        // First silence: ask once more. Second: stop listening and wait for a tap, without nagging.
        if (++quiet >= 2) return wait();
        continue;
      }
      quiet = 0;
      const j = judgeKid(task.card, r.texts, others);
      setHeard(j.heard);
      const res = nextStep(w, j.ok);
      if (j.ok) {
        const first = "done" in res && res.done === "first";
        sfx.hit(first ? run.current + 1 : 1);
        setMood("happy");
        setPhase("right");
        if (first) flyStar();
        // Echo echoes the word back.
        await en(first ? `Yes! ${task.card.en}` : task.card.en, signal);
        await sleep(500, signal);
      } else {
        sfx.miss();
        setMood("think");
        setPhase("miss");
        await sleep(700, signal);
      }
      if (signal.aborted) return;
      if ("done" in res) {
        if (res.done === "practised") await pl("Dobra próba!", signal);
        settle(task, res.done);
        const n = i + 1;
        moveTo(n, startWord(tasks[n]?.intro ? "repeat" : "say"));
      } else moveTo(i, res.next);
    }
  };

  /** (Re)starts the current word: Echo asks again and listens. */
  const go = () => {
    halt();
    const c = new AbortController();
    ctl.current = c;
    setProblem("");
    void keepScreenOn(true);
    void loop(c.signal);
  };

  useEffect(() => {
    go();
    const onVisibility = () => {
      if (document.hidden && phaseRef.current !== "error") wait();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      halt();
      void keepScreenOn(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const task = tasks[Math.min(idx, tasks.length - 1)];
  if (!task) return null;
  const c = task.card;
  const showWord = task.intro || ws.step === "repeat" || phase === "right";
  const questions = round.questions.length;
  const qNo = task.intro ? 0 : idx - round.intro.length;
  // Tapping Echo asks again; after silence or a pause it starts listening again.
  const tapBat = () => phaseRef.current !== "right" && go();

  const askLine =
    phase === "waiting" ? <>Dotknij Echo,<br />kiedy chcesz mówić</>
    : phase === "right" ? <>Brawo!</>
    : phase === "miss" ? <>Jeszcze raz!</>
    : ws.step === "repeat" ? <>Powtórz za mną!</>
    : <>Jak to jest<br />po angielsku?</>;

  return (
    <div className="kscreen">
      <header className="khdr">
        <button className="kround" onClick={onExit} aria-label="Wróć do mapy"><Icon name="map" size={32} /></button>
        <h1>{island.title}</h1>
        <span className="sp" />
        <div className="dots" aria-label={task.intro ? `Nowe słowo ${idx + 1} z ${round.intro.length}` : `Pytanie ${qNo + 1} z ${questions}`}>
          {(task.intro ? round.intro : round.questions).map((_, k) => {
            const pos = task.intro ? idx : qNo;
            return <i key={k} className={k < pos ? "on" : k === pos ? "cur" : ""} />;
          })}
        </div>
        {streak >= 2 && <span key={streak} className="combo" role="status">🔥 {streak}<span className="combo-l"> z rzędu!</span></span>}
        <Jar stars={s.kids.stars} />
      </header>
      <div className="kspeak">
        <div className={`kcard kspeak-card${phase === "right" ? " right" : ""}`}>
          <span className="kcard-e" ref={pic}>{c.emoji}</span>
          {showWord ? (
            <span className="kcard-w echoword" lang="en">
              {c.en}
              {phase === "right" && <><i aria-hidden="true">{c.en}</i><i aria-hidden="true">{c.en}</i></>}
            </span>
          ) : ws.step === "hint" ? (
            <span className="kcard-w khint" lang="en" aria-label={`Podpowiedź: ${c.en[0]}`}>{hint(c)}</span>
          ) : null}
          <span className="kcard-pl">{c.pl}</span>
        </div>
        <div className="kspeak-side">
          <button className="batbtn" onClick={tapBat} aria-label={phase === "waiting" ? "Dotknij, żeby mówić" : "Echo powtarza"}>
            <Bat mood={mood} />
          </button>
          <p className="ask" role="status">{askLine}</p>
          {(phase === "listening" || heard) && (
            <div className={`kmic${phase === "listening" ? " on" : ""}`}>
              <Icon name="mic" size={28} />
              <span>{phase === "listening" ? heard || "Słucham…" : `Echo usłyszało: ${heard}`}</span>
            </div>
          )}
          {phase === "waiting" && <button className="kbtn" onClick={go}><Icon name="mic" size={32} /> Mów</button>}
          {phase === "error" && (
            <div className="kproblem" role="alert">
              <p>{problem}</p>
              <div className="row">
                <button className="kbtn" onClick={go}>Jeszcze raz</button>
                <button className="kbtn kbtn-quiet" onClick={onExit}><Icon name="map" size={32} /> Mapa</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {flyers.map((f) => (
        <i key={f.key} className="flystar" aria-hidden="true" style={{ left: f.x, top: f.y, "--dx": `${f.dx}px`, "--dy": `${f.dy}px` } as CSSProperties} />
      ))}
    </div>
  );
}
