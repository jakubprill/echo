import { useEffect, useState } from "react";
import { AdultApp } from "./adult/AdultApp";
import { KidsApp } from "./kids/KidsApp";
import { counts } from "./core/session";
import { dayNumber } from "./core/date";
import type { Audience } from "./core/types";
import { decksFor, update, useAppState } from "./state/store";
import { Icon } from "./ui/icons";
import { Bat } from "./ui/Bat";

/** Motyw „system” bierze ustawienie z hosta (artefakt Claude) albo z systemu. */
function useSystemDark(): boolean {
  const read = () => {
    const forced = document.documentElement.dataset.theme;
    return forced ? forced === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const on = () => setDark(read());
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", on);
    const mo = new MutationObserver(on);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", on);
      mo.disconnect();
    };
  }, []);
  return dark;
}

export function setLine(line: Audience | null) {
  update((s) => ({ ...s, settings: { ...s.settings, line } }));
}

export function App() {
  const s = useAppState();
  const systemDark = useSystemDark();
  const { line, theme } = s.settings;
  const adultTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  const applied = line === "kids" ? "kids" : adultTheme;

  useEffect(() => {
    document.body.dataset.echoTheme = applied;
  }, [applied]);

  return (
    <div className="echo" data-theme={applied}>
      {line === "kids" ? <KidsApp /> : line === "adults" ? <AdultApp /> : <Chooser />}
    </div>
  );
}

function Chooser() {
  const s = useAppState();
  const c = counts(decksFor(s, "adults"), s, dayNumber());
  const kidsDecks = decksFor(s, "kids").length;
  return (
    <main className="chooser">
      <div className="chooser-head">
        <span className="logo"><Icon name="bat" size={30} /></span>
        <h1>Echo</h1>
        <p>Kto się dziś uczy?</p>
      </div>
      <div className="chooser-grid">
        <button className="profile" onClick={() => setLine("adults")}>
          <span className="profile-art"><Icon name="deck" size={56} /></span>
          <b>Echo</b>
          <span>Fiszki z powtórkami, quiz i lektor</span>
          <small>{c.total} słówek · {c.due + c.fresh} na dziś</small>
        </button>
        <button className="profile profile-kids" onClick={() => setLine("kids")}>
          <span className="profile-art"><Bat /></span>
          <b>Echo Kids</b>
          <span>Wyspy, gra ze słuchu i naklejki</span>
          <small>{kidsDecks === 0 ? "brak talii dla dzieci" : `${kidsDecks} ${kidsDecks === 1 ? "wyspa" : "wyspy"} do odkrycia · ${s.kids.stars} ★`}</small>
        </button>
      </div>
      <p className="chooser-foot">Wersja alfa 0.1 · dane zostają na tym urządzeniu</p>
    </main>
  );
}
