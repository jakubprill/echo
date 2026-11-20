import { useState } from "react";
import { Icon, type IconName } from "../ui/icons";
import { Home } from "./Home";
import { Study } from "./Study";
import { Quiz } from "./Quiz";
import { Decks } from "./Decks";
import { Progress } from "./Progress";
import { Settings } from "./Settings";
import { Voice } from "./Voice";
import { ProfileButton, ProfileSheet } from "./ProfileSwitch";

export type View = { name: "home" | "decks" | "progress" | "settings" | "study" | "quiz" | "voice"; deckId?: string; folder?: string };
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
  const [switching, setSwitching] = useState(false);
  const active = view.name === "study" || view.name === "voice" ? "home" : view.name;
  // Study and the voice mode take the full screen so navigation does not distract during a session.
  const immersive = view.name === "study" || view.name === "voice";
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
          <ProfileButton onOpen={() => setSwitching(true)} />
        </nav>
      )}
      <main className="main">
        {view.name === "home" && <Home nav={setView} />}
        {view.name === "study" && <Study deckId={view.deckId} folder={view.folder} nav={setView} />}
        {view.name === "voice" && <Voice key={view.deckId ?? view.folder ?? "all"} deckId={view.deckId} folder={view.folder} nav={setView} />}
        {view.name === "quiz" && <Quiz key={view.deckId ?? view.folder ?? "all"} deckId={view.deckId} folder={view.folder} nav={setView} />}
        {view.name === "decks" && <Decks key={view.folder ?? "all"} nav={setView} folder={view.folder} />}
        {view.name === "progress" && <Progress />}
        {view.name === "settings" && <Settings />}
      </main>
      {switching && <ProfileSheet onClose={() => setSwitching(false)} />}
    </div>
  );
}
