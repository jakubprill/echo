import { useState } from "react";
import { Icon, type IconName } from "../ui/icons";
import { Home } from "./Home";
import { Study } from "./Study";
import { Quiz } from "./Quiz";
import { Decks } from "./Decks";
import { Progress } from "./Progress";
import { Settings } from "./Settings";

export type View = { name: "home" | "decks" | "progress" | "settings" | "study" | "quiz"; deckId?: string };
export type Nav = (v: View) => void;

const TABS: { name: "home" | "decks" | "quiz" | "progress" | "settings"; icon: IconName; label: string }[] = [
  { name: "home", icon: "home", label: "Start" },
  { name: "decks", icon: "deck", label: "Talie" },
  { name: "quiz", icon: "quiz", label: "Quiz" },
  { name: "progress", icon: "chart", label: "Postęp" },
  { name: "settings", icon: "settings", label: "Ustawienia" },
];

export function AdultApp() {
  const [view, setView] = useState<View>({ name: "home" });
  const active = view.name === "study" ? "home" : view.name;
  // Nauka i quiz zajmują cały ekran: w trakcie sesji nawigacja nie rozprasza.
  const immersive = view.name === "study";
  return (
    <div className={`shell${immersive ? " shell-immersive" : ""}`}>
      {!immersive && (
        <nav className="rail" aria-label="Nawigacja">
          <span className="logo"><Icon name="bat" size={30} /></span>
          {TABS.map((t) => (
            <button key={t.name} className={active === t.name ? "on" : ""} aria-current={active === t.name ? "page" : undefined} onClick={() => setView({ name: t.name })}>
              <Icon name={t.icon} size={28} />
              {t.label}
            </button>
          ))}
        </nav>
      )}
      <main className="main">
        {view.name === "home" && <Home nav={setView} />}
        {view.name === "study" && <Study deckId={view.deckId} nav={setView} />}
        {view.name === "quiz" && <Quiz key={view.deckId ?? "all"} deckId={view.deckId} nav={setView} />}
        {view.name === "decks" && <Decks nav={setView} />}
        {view.name === "progress" && <Progress />}
        {view.name === "settings" && <Settings />}
      </main>
    </div>
  );
}
