// Voice mode ("Tryb głosowy"): hands-free practice. Echo says a word, opens the microphone, judges
// the spoken translation and moves on by itself. The rules live in core/voice.ts; this screen only
// drives speech and the microphone in a loop and shows what is happening.
import { useEffect, useMemo, useRef, useState } from "react";
import { dayNumber } from "../core/date";
import {
  advance, answerLang, answerText, buildVoiceQueue, judge, overrule, promptLang, promptText, recordAnswer, restore, scopeCards, snapshot, speakable, startSession,
  type AnswerSnapshot, type Lang, type VoiceDir, type VoiceItem, type VoiceScope, type VoiceSession,
} from "../core/voice";
import { canListen, keepScreenOn, listen, listensNatively, stopListening, type ListenError } from "../platform/listen";
import { setSfxEnabled, sfx } from "../platform/sfx";
import { hasPolishVoice, speakAndWait, stopSpeaking, ttsAvailable } from "../platform/tts";
import { decksFor, getState, update, useAppState } from "../state/store";
import { Icon } from "../ui/icons";
import { VoiceNotice } from "../ui/VoiceNotice";
import type { Nav } from "./AdultApp";
import { plural } from "./Home";
import { Seg } from "./Settings";

const LIMITS: [string, string][] = [["10", "10"], ["20", "20"], ["30", "30"], ["0", "Wszystkie"]];
const SCOPES: [VoiceScope, string][] = [["all", "Wszystkie"], ["due", "Do powtórki"], ["hard", "Trudne"], ["new", "Nowe"]];
const DIRS: [VoiceDir, string][] = [["en-pl", "Angielski → polski"], ["pl-en", "Polski → angielski"], ["mixed", "Na zmianę"]];

export function Voice({ deckId, nav }: { deckId?: string; nav: Nav }) {
  const [run, setRun] = useState<{ queue: VoiceItem[]; mic: boolean; n: number } | null>(null);
  if (run) return <VoiceRun key={run.n} queue={run.queue} mic={run.mic} onBack={() => setRun(null)} onAgain={(queue) => setRun({ queue, mic: run.mic, n: run.n + 1 })} nav={nav} />;
  return <VoiceSetup deckId={deckId} nav={nav} onStart={(queue, mic) => setRun({ queue, mic, n: 1 })} />;
}

// ─── choosing the words ─────────────────────────────────────────────────────────

function VoiceSetup({ deckId, nav, onStart }: { deckId?: string; nav: Nav; onStart: (queue: VoiceItem[], mic: boolean) => void }) {
  const s = useAppState();
  const today = dayNumber();
  const decks = decksFor(s, "adults");
  const prefs = s.settings.voice;
  const hearing = canListen();
  const [dir, setDir] = useState<VoiceDir>(prefs?.dir ?? "en-pl");
  const [scope, setScope] = useState<VoiceScope>(prefs?.scope ?? "all");
  const [limit, setLimit] = useState(prefs?.limit ?? 20);
  const [mic, setMic] = useState(hearing && (prefs?.mic ?? true));
  const [chosen, setChosen] = useState<Set<string>>(() => {
    if (deckId) return new Set([deckId]);
    const last = (prefs?.decks ?? []).filter((id) => decks.some((d) => d.id === id));
    return new Set(last.length ? last : decks.map((d) => d.id));
  });
  const [off, setOff] = useState<Set<string>>(() => new Set());
  const [showWords, setShowWords] = useState(false);
  const [polish, setPolish] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    if (ttsAvailable()) void hasPolishVoice().then((ok) => live && setPolish(ok));
    return () => {
      live = false;
    };
  }, []);

  const picked = decks.filter((d) => chosen.has(d.id));
  const cards = useMemo(() => {
    const seen = new Set<string>();
    return scopeCards(picked, s, scope, today).filter((c) => !seen.has(c.id) && !!seen.add(c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked.map((d) => d.id).join(), s.progress, scope, today]);
  const ids = cards.filter((c) => !off.has(c.id)).map((c) => c.id);
  const count = limit > 0 ? Math.min(limit, ids.length) : ids.length;
  const scopeCount = (sc: VoiceScope) => new Set(scopeCards(picked, s, sc, today).map((c) => c.id)).size;

  const toggleDeck = (id: string) =>
    setChosen((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleWord = (id: string) =>
    setOff((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const start = () => {
    update((st) => ({ ...st, settings: { ...st.settings, voice: { dir, scope, limit, decks: [...chosen], mic } } }));
    onStart(buildVoiceQueue(picked, new Set(ids), dir, limit), mic);
  };

  return (
    <div className="page voice-setup">
      <header className="head-row">
        <button className="round" onClick={() => nav({ name: "home" })} aria-label="Wróć na start"><Icon name="back" /></button>
        <div>
          <h1>Tryb głosowy</h1>
          <p className="sub">Echo czyta słówko, Ty mówisz tłumaczenie na głos. Dobra odpowiedź: następne słówko. Zła: Echo mówi poprawną, a słówko wraca za chwilę.</p>
        </div>
      </header>

      <VoiceNotice />
      {!hearing && (
        <p className="notice notice-warn" role="status">
          Na tym urządzeniu Echo jeszcze nie rozpoznaje mowy (działa na Androidzie i w przeglądarce Chrome). Możesz ćwiczyć w trybie słuchania: Echo powie słówko, da chwilę do namysłu i powie tłumaczenie.
        </p>
      )}
      {polish === false && dir !== "en-pl" && (
        <p className="notice notice-warn" role="status">Na tym urządzeniu nie ma polskiego głosu, więc polskich słówek nie usłyszysz. Dodasz go w ustawieniach mowy systemu (zamiana tekstu na mowę).</p>
      )}

      <section className="panel form">
        <h2>Kierunek</h2>
        <Seg label="Kierunek" value={dir} options={DIRS} onChange={setDir} />
        <label className={`field field-check${hearing ? "" : " field-off"}`} htmlFor="voice-mic"><span>Odpowiadam na głos (mikrofon)</span>
          <input id="voice-mic" type="checkbox" checked={mic} disabled={!hearing} onChange={(e) => setMic(e.target.checked)} />
        </label>
        {!mic && hearing && <p className="sub">Bez mikrofonu Echo tylko czyta: słówko, chwila na namysł, tłumaczenie. Postępy się wtedy nie zmieniają.</p>}
      </section>

      <section className="panel form">
        <h2>Słówka</h2>
        {decks.length === 0 ? (
          <p className="empty">Najpierw wczytaj talię w zakładce Talie.</p>
        ) : (
          <>
            <div className="voice-decks" role="group" aria-label="Talie">
              {decks.map((d) => (
                <button key={d.id} className="voice-deck" aria-pressed={chosen.has(d.id)} onClick={() => toggleDeck(d.id)}>
                  <span className="voice-tick" aria-hidden="true">{chosen.has(d.id) && <Icon name="check" size={18} />}</span>
                  <b>{d.title}</b>
                  <small>{d.cards.length}</small>
                </button>
              ))}
            </div>
            <Seg label="Które słówka" value={scope} options={SCOPES.map(([v, l]) => [v, `${l} (${scopeCount(v)})`])} onChange={setScope} />
            <div className="field"><span>Ile w jednej sesji</span><Seg label="Ile słówek" value={String(limit)} options={LIMITS} onChange={(v) => setLimit(Number(v))} /></div>
            <div className="row">
              <button className="btn btn-quiet" aria-expanded={showWords} onClick={() => setShowWords((x) => !x)}>
                {showWords ? "Ukryj listę" : "Wybierz pojedyncze słówka"}
              </button>
              {off.size > 0 && <button className="btn btn-quiet" onClick={() => setOff(new Set())}>Zaznacz wszystkie</button>}
            </div>
            {showWords && (
              <ul className="words voice-words">
                {cards.map((c) => (
                  <li key={c.id}>
                    <label>
                      <input type="checkbox" checked={!off.has(c.id)} onChange={() => toggleWord(c.id)} />
                      <span><b lang="en">{c.en}</b><span>{c.pl}</span></span>
                    </label>
                  </li>
                ))}
                {cards.length === 0 && <li className="empty">W wybranych taliach nie ma takich słówek.</li>}
              </ul>
            )}
          </>
        )}
      </section>

      <div className="voice-start">
        <button className="btn" disabled={count === 0} onClick={start}><Icon name={mic ? "mic" : "speaker"} /> Zacznij ({count} {plural(count, "słówko", "słówka", "słówek")})</button>
        {mic && <p className="hint">W trakcie możesz powiedzieć: „powtórz”, „nie wiem”, „pauza” albo „koniec”.</p>}
      </div>
    </div>
  );
}

// ─── the session ────────────────────────────────────────────────────────────────

type Phase = "speaking" | "listening" | "thinking" | "correct" | "wrong" | "paused" | "done";
type Last = { item: VoiceItem; ok: boolean; heard: string; snap?: AnswerSnapshot; overruled?: boolean };

/** Thinking time before the answer in listening-only mode. */
const THINK_MS = 4000;

const ERRORS: Record<ListenError, string> = {
  permission: "Echo nie ma dostępu do mikrofonu. Zezwól na niego, gdy telefon zapyta, albo w ustawieniach telefonu: Aplikacje → Echo → Uprawnienia → Mikrofon.",
  unavailable: "Na tym urządzeniu nie działa rozpoznawanie mowy. Na Androidzie zapewnia je aplikacja Google.",
  network: "Rozpoznawanie mowy potrzebuje internetu. Sprawdź połączenie i wznów.",
  language: "Telefon nie rozpoznaje mowy w tym języku. Dodaj język w ustawieniach rozpoznawania mowy (Google → Głos).",
  busy: "Rozpoznawanie mowy jest zajęte. Wznów za chwilę.",
  other: "Rozpoznawanie mowy nie odpowiada. Wznów za chwilę.",
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });

const same = (a: VoiceItem | undefined, b: VoiceItem) => !!a && a.card.id === b.card.id && a.dir === b.dir;

function VoiceRun({ queue, mic, onBack, onAgain, nav }: { queue: VoiceItem[]; mic: boolean; onBack: () => void; onAgain: (q: VoiceItem[]) => void; nav: Nav }) {
  const [session, setSession] = useState<VoiceSession>(() => startSession(queue));
  const [phase, setPhaseState] = useState<Phase>("speaking");
  const [shown, setShown] = useState<VoiceItem | undefined>(queue[0]);
  const [reveal, setReveal] = useState(false);
  const [heard, setHeard] = useState("");
  const [last, setLast] = useState<Last | null>(null);
  const [note, setNote] = useState("");
  const sess = useRef(session);
  const phaseRef = useRef<Phase>("speaking");
  const ctl = useRef<AbortController | null>(null);
  const missed = useRef(new Map<string, VoiceItem>());
  const streak = useRef(0);

  const commit = (next: VoiceSession) => {
    sess.current = next;
    setSession(next);
  };
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const say = (text: string, lang: Lang, signal?: AbortSignal) => {
    const st = getState().settings;
    return speakAndWait(speakable(text), { language: st.accent, voiceId: st.voiceId, rate: st.rate, polish: lang === "pl", signal });
  };
  const tag = (lang: Lang) => (lang === "pl" ? "pl-PL" : getState().settings.accent);

  /** Stops speaking and listening. */
  const halt = () => {
    ctl.current?.abort();
    ctl.current = null;
    stopListening();
    stopSpeaking();
  };

  const pause = (why: string, spoken = false) => {
    halt();
    setPhase("paused");
    setNote(why);
    void keepScreenOn(false);
    if (spoken) void say("Pauza.", "pl");
  };

  const finish = () => {
    halt();
    setPhase("done");
    void keepScreenOn(false);
    const s = sess.current;
    if (mic && s.right + s.wrong > 0) void say(`Koniec. Za pierwszym razem: ${s.firstTry} z ${s.total}.`, "pl");
    else void say("Koniec.", "pl");
  };

  const answer = async (item: VoiceItem, ok: boolean, said: string, signal: AbortSignal) => {
    const today = dayNumber();
    const snap = snapshot(getState(), item.card.id, today);
    update((st) => recordAnswer(st, item, ok, today));
    if (same(sess.current.queue[0], item)) commit(advance(sess.current, ok));
    setLast({ item, ok, heard: said, snap });
    if (ok) {
      streak.current++;
      sfx.hit(Math.min(streak.current, 8));
      setPhase("correct");
      await sleep(650, signal);
    } else {
      streak.current = 0;
      missed.current.set(`${item.card.id} ${item.dir}`, { ...item, misses: 0 });
      sfx.miss();
      setPhase("wrong");
      setReveal(true);
      await sleep(350, signal);
      await say(answerText(item), answerLang(item), signal);
      await sleep(700, signal);
    }
  };

  const loop = async (signal: AbortSignal, first?: "skip") => {
    let pending = first;
    while (!signal.aborted) {
      const item = sess.current.queue[0];
      if (!item) return finish();
      setShown(item);
      setHeard("");
      setReveal(false);
      if (pending === "skip") {
        pending = undefined;
        await answer(item, false, "", signal);
        continue;
      }
      setPhase("speaking");
      await say(promptText(item), promptLang(item), signal);
      if (signal.aborted) return;

      if (!mic) {
        setPhase("thinking");
        await sleep(THINK_MS, signal);
        if (signal.aborted) return;
        setReveal(true);
        setPhase("correct");
        await say(answerText(item), answerLang(item), signal);
        await sleep(1500, signal);
        if (signal.aborted) return;
        if (same(sess.current.queue[0], item)) commit(advance(sess.current, true));
        continue;
      }

      let quiet = 0, failures = 0;
      for (;;) {
        setPhase("listening");
        const r = await listen(tag(answerLang(item)), { signal, onPartial: setHeard });
        if (signal.aborted || r.kind === "aborted") return;
        if (r.kind === "error") {
          if ((r.reason === "busy" || r.reason === "other") && ++failures < 3) {
            await sleep(800, signal);
            continue;
          }
          return pause(r.reason === "permission" && !listensNatively() ? "Przeglądarka nie dała dostępu do mikrofonu. Zezwól na niego przy pasku adresu (ikona kłódki) i wznów." : ERRORS[r.reason], true);
        }
        const j = r.kind === "heard" ? judge(item, r.texts) : { verdict: "silence" as const, heard: "" };
        setHeard(j.heard);
        if (j.verdict === "silence") {
          // First silence: more time to think. Second: say the word again. Third: nobody is there.
          quiet++;
          if (quiet >= 3) return pause("Nie słyszę odpowiedzi, więc sesja czeka. Wznów, kiedy wrócisz.", true);
          if (quiet === 2) {
            setPhase("speaking");
            await say(promptText(item), promptLang(item), signal);
            if (signal.aborted) return;
          }
          continue;
        }
        if (j.verdict === "repeat") {
          setPhase("speaking");
          await say(promptText(item), promptLang(item), signal);
          if (signal.aborted) return;
          quiet = 0;
          continue;
        }
        if (j.verdict === "pause") return pause("Pauza. Wznów, kiedy zechcesz.", true);
        if (j.verdict === "end") return finish();
        await answer(item, j.verdict === "correct", j.verdict === "skip" ? "" : j.heard, signal);
        break;
      }
    }
  };

  const go = (first?: "skip") => {
    halt();
    const c = new AbortController();
    ctl.current = c;
    setNote("");
    void keepScreenOn(true);
    void loop(c.signal, first);
  };

  const accept = () => {
    if (!last || last.ok || !last.snap) return;
    const { item, snap } = last;
    const wasCurrent = same(sess.current.queue[0], item) && phaseRef.current !== "wrong";
    update((st) => recordAnswer(restore(st, snap), item, true, snap.today));
    commit(overrule(sess.current, item));
    missed.current.delete(`${item.card.id} ${item.dir}`);
    setLast({ ...last, ok: true, overruled: true });
    // The word that came back is being asked right now: move on to the next one.
    if (wasCurrent && phaseRef.current !== "paused" && phaseRef.current !== "done") go();
  };

  useEffect(() => {
    setSfxEnabled(true);
    go();
    const onVisibility = () => {
      if (document.hidden && phaseRef.current !== "paused" && phaseRef.current !== "done") pause("Echo było w tle, więc sesja czeka.");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      halt();
      void keepScreenOn(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const p = phaseRef.current;
      if (e.key === " ") {
        e.preventDefault();
        if (p === "paused") go();
        else if (p !== "done") pause("Pauza. Wznów, kiedy zechcesz.");
      } else if (p === "done") return;
      else if (e.key === "r" || e.key === "R") go();
      else if ((e.key === "n" || e.key === "N") && mic) go("skip");
      else if (e.key === "Escape") onBack();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const done = session.total - session.queue.length;
  const item = shown;

  if (phase === "done") {
    const again = [...missed.current.values()];
    return (
      <div className="study">
        <div className="finish">
          <span className="finish-mark"><Icon name="check" size={44} /></span>
          <h1>Sesja skończona</h1>
          {mic ? (
            <p className="sub">
              Za pierwszym razem: {session.firstTry} z {session.total}. {session.wrong > 0 ? `Pomyłki: ${session.wrong}.` : "Bez pomyłek!"}
              {session.queue.length > 0 ? ` Nie przerobione: ${session.queue.length}.` : ""}
            </p>
          ) : (
            <p className="sub">Przesłuchane słówka: {session.right} z {session.total}.</p>
          )}
          <div className="row">
            {again.length > 0 && <button className="btn" onClick={() => onAgain(again)}><Icon name="mic" /> Jeszcze raz pomyłki ({again.length})</button>}
            <button className={again.length > 0 ? "btn btn-quiet" : "btn"} onClick={onBack}>Nowa sesja</button>
            <button className="btn btn-quiet" onClick={() => nav({ name: "home" })}>Wróć na start</button>
          </div>
        </div>
      </div>
    );
  }

  const paused = phase === "paused";
  const status: Record<Phase, string> = {
    speaking: "Czytam…",
    listening: "Słucham…",
    thinking: "Pomyśl…",
    correct: mic ? "Dobrze!" : "Tłumaczenie",
    wrong: "Poprawna odpowiedź",
    paused: "Pauza",
    done: "",
  };

  return (
    <div className="study voice">
      <div className="top">
        <button className="round" onClick={onBack} aria-label="Zakończ sesję"><Icon name="close" /></button>
        <div className="prog" role="progressbar" aria-valuemin={0} aria-valuemax={session.total} aria-valuenow={done}><i style={{ width: `${(done / Math.max(1, session.total)) * 100}%` }} /></div>
        <span className="count">{done} / {session.total}</span>
      </div>

      <div className="voice-stage">
        <div className={`voice-card voice-${phase}`} aria-live="polite">
          <span className="voice-status">
            <span className="voice-dot" aria-hidden="true"><Icon name={phase === "listening" ? "mic" : phase === "paused" ? "pause" : "speaker"} size={20} /></span>
            {status[phase]}
          </span>
          {item && (
            <>
              <div className="word" lang={promptLang(item)}>{promptText(item)}</div>
              {reveal ? (
                <div className="tr" lang={answerLang(item)}>{answerText(item)}</div>
              ) : (
                <div className="face-hint">{answerLang(item) === "pl" ? "Powiedz po polsku" : "Powiedz po angielsku"}</div>
              )}
            </>
          )}
          {heard && phase !== "paused" && <div className="voice-heard">Słyszę: „{heard}”</div>}
          {paused && <p className="voice-note">{note}</p>}
        </div>

        {last && (
          <div className={`verdict ${last.ok ? "verdict-ok" : "verdict-no"}`}>
            <div>
              <b>{last.ok ? (last.overruled ? "Uznane" : "Dobrze") : "Wróci za chwilę"}</b>
              <p className="sub"><span lang="en">{last.item.card.en}</span> — {last.item.card.pl}{!last.ok && last.heard ? ` · usłyszałem „${last.heard}”` : ""}</p>
            </div>
            {!last.ok && last.heard && <button className="btn btn-quiet" onClick={accept}>Uznaj, było dobrze</button>}
          </div>
        )}
      </div>

      <div className="voice-controls">
        <button className="btn btn-quiet" onClick={() => go()} disabled={paused}><Icon name="speaker" /> Powtórz</button>
        {mic && <button className="btn btn-quiet" onClick={() => go("skip")} disabled={phase !== "speaking" && phase !== "listening"}>Nie wiem</button>}
        {paused ? (
          <button className="btn" onClick={() => go()}><Icon name="play" /> Wznów</button>
        ) : (
          <button className="btn" onClick={() => pause("Pauza. Wznów, kiedy zechcesz.")}><Icon name="pause" /> Pauza</button>
        )}
      </div>
    </div>
  );
}
