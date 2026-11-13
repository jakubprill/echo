import { useEffect, useMemo, useRef, useState } from "react";
import { dayNumber } from "../core/date";
import { buildQuiz, checkTyped, type Question } from "../core/quiz";
import { markDueNow } from "../core/session";
import { decksFor, getState, say, update } from "../state/store";
import { Icon } from "../ui/icons";
import type { Nav } from "./AdultApp";

type Result = { q: Question; ok: boolean };

export function Quiz({ deckId, nav }: { deckId?: string; nav: Nav }) {
  const [round, setRound] = useState(0);
  const questions = useMemo(() => {
    const st = getState();
    const cards = decksFor(st, "adults").filter((d) => !deckId || d.id === deckId).flatMap((d) => d.cards);
    // The quiz checks words already seen on flashcards first.
    const seen = cards.filter((c) => st.progress[c.id]);
    return buildQuiz(seen.length >= 8 ? seen : cards, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, round]);
  const [i, setI] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [verdict, setVerdict] = useState<null | "ok" | "typo" | "wrong">(null);
  const input = useRef<HTMLInputElement>(null);
  const q = questions[i];
  const answered = verdict !== null;

  const settle = (ok: boolean, v: "ok" | "typo" | "wrong") => {
    if (answered || !q) return;
    setVerdict(v);
    setResults((r) => [...r, { q, ok }]);
    if (!ok) update((s) => markDueNow(s, q.card.id, dayNumber()));
    say(q.card.en);
  };
  const next = () => {
    setI((n) => n + 1);
    setPicked(null);
    setTyped("");
    setVerdict(null);
  };
  const choose = (k: number) => {
    if (answered || q?.kind !== "choice") return;
    setPicked(k);
    settle(k === q.answer, k === q.answer ? "ok" : "wrong");
  };

  useEffect(() => {
    if (q?.kind === "type") input.current?.focus();
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q) return;
      if (answered && e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (q.kind === "choice" && "1234".includes(e.key)) choose(Number(e.key) - 1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  if (questions.length === 0)
    return (
      <div className="page">
        <header><h1>Quiz</h1><p className="sub">Wczytaj talię, żeby zrobić quiz.</p></header>
        <div><button className="btn" onClick={() => nav({ name: "decks" })}><Icon name="import" /> Przejdź do talii</button></div>
      </div>
    );

  if (!q) {
    const good = results.filter((r) => r.ok).length;
    const wrong = results.filter((r) => !r.ok);
    return (
      <div className="page">
        <header>
          <h1>Wynik: {good} / {results.length}</h1>
          <p className="sub">{wrong.length === 0 ? "Bez błędów." : "Błędne odpowiedzi wrócą w najbliższej powtórce."}</p>
        </header>
        {wrong.length > 0 && (
          <ul className="words">
            {wrong.map(({ q }) => (
              <li key={q.card.id}>
                <button className="mini" onClick={() => say(q.card.en)} aria-label={`Posłuchaj: ${q.card.en}`}><Icon name="speaker" size={20} /></button>
                <span><b lang="en">{q.card.en}</b><span>{q.card.pl}</span></span>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button className="btn" onClick={() => { setRound((r) => r + 1); setI(0); setResults([]); }}>Jeszcze raz</button>
          <button className="btn btn-quiet" onClick={() => nav({ name: "home" })}>Wróć na start</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page quiz">
      <div className="top">
        <div className="prog" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={i}><i style={{ width: `${(i / questions.length) * 100}%` }} /></div>
        <span className="count">{i + 1} / {questions.length}</span>
      </div>
      <div className="q">
        <div className="sub">{q.hint}</div>
        <div className="word">{q.prompt}</div>
      </div>

      {q.kind === "choice" ? (
        <div className="opts">
          {q.options.map((o, k) => (
            <button
              key={o}
              className={`opt${answered && k === q.answer ? " ok" : ""}${answered && k === picked && k !== q.answer ? " no" : ""}`}
              onClick={() => choose(k)}
              aria-disabled={answered}
            >
              <kbd>{k + 1}</kbd>
              <span>{o}</span>
            </button>
          ))}
        </div>
      ) : (
        <form
          className="typed"
          onSubmit={(e) => {
            e.preventDefault();
            if (answered) return next();
            const v = checkTyped(typed, q.answer);
            settle(v !== "wrong", v);
          }}
        >
          {q.sentence && (
            <p className="sentence" lang="en">{q.sentence[0]}<span className="gap">{answered ? q.answer : " "}</span>{q.sentence[1]}</p>
          )}
          <div className="typed-row">
            <input id="quiz-answer" ref={input} value={typed} onChange={(e) => setTyped(e.target.value)} readOnly={answered} placeholder="Wpisz po angielsku" autoComplete="off" autoCapitalize="off" spellCheck={false} lang="en" aria-label="Odpowiedź po angielsku" />
            {!answered && <button className="btn" type="submit">Sprawdź</button>}
          </div>
        </form>
      )}

      {answered && (
        <div className={`verdict verdict-${verdict === "wrong" ? "no" : "ok"}`} role="status">
          <div>
            <b>{verdict === "ok" ? "Dobrze" : verdict === "typo" ? "Dobrze, z literówką" : "Poprawna odpowiedź"}</b>
            <span lang="en">{q.card.en}</span> <span className="sub">{q.card.pl}</span>
          </div>
          <button className="btn" onClick={next} autoFocus={q.kind === "choice"}>Dalej <Icon name="next" /></button>
        </div>
      )}
    </div>
  );
}
