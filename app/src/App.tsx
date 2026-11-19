import { useEffect, useState } from "react";
import { AdultApp } from "./adult/AdultApp";
import { KidsApp } from "./kids/KidsApp";
import { counts } from "./core/session";
import { dayNumber } from "./core/date";
import { addProfile, AVATARS, cleanName, editProfile, MAX_NAME, profileView, removeProfile, selectProfile, type Profile } from "./core/profiles";
import type { Audience } from "./core/types";
import { decksFor, updateHousehold, useAppState, useHousehold } from "./state/store";
import { Icon } from "./ui/icons";
import { setDarkSystemBars } from "./platform/insets";
import { UpdateBanner } from "./ui/UpdateBanner";
import { canListen, listen, stopListening, type ListenError } from "./platform/listen";

/** The "system" theme follows the host (Claude artifact) or the operating system. */
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

/** Back to the profile chooser. */
export function leaveProfile() {
  updateHousehold((h) => selectProfile(h, null));
}

export function App() {
  const s = useAppState();
  const systemDark = useSystemDark();
  const { line, theme } = s.settings;
  const adultTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  const applied = line === "kids" ? "kids" : adultTheme;

  useEffect(() => {
    document.body.dataset.echoTheme = applied;
    setDarkSystemBars(applied !== "light");
  }, [applied]);

  return (
    <div className="echo" data-theme={applied}>
      {line === "kids" ? <KidsApp /> : line === "adults" ? <AdultApp /> : <Chooser />}
    </div>
  );
}

function islandsLabel(n: number): string {
  const d = n % 10, t = n % 100;
  return `${n} ${n === 1 ? "wyspa" : d >= 2 && d <= 4 && !(t >= 12 && t <= 14) ? "wyspy" : "wysp"}`;
}

type Form = { mode: "add" } | { mode: "edit"; id: string };

function Chooser() {
  const h = useHousehold();
  const [manage, setManage] = useState(false);
  const [form, setForm] = useState<Form | null>(h.profiles.length === 0 ? { mode: "add" } : null);
  const today = dayNumber();

  if (form) {
    const p = form.mode === "edit" ? h.profiles.find((x) => x.id === form.id) : undefined;
    return <ProfileForm profile={p} first={h.profiles.length === 0} onClose={() => setForm(null)} />;
  }
  return (
    <main className="chooser">
      <div className="chooser-head">
        <span className="logo"><Icon name="bat" size={30} /></span>
        <h1>Echo</h1>
        <p>{manage ? "Wybierz profil, który chcesz zmienić." : "Kto się dziś uczy?"}</p>
      </div>
      {!manage && <UpdateBanner />}
      <div className="chooser-grid">
        {h.profiles.map((p) => {
          const v = profileView(h, p);
          let stat: string;
          if (p.kind === "kids") stat = `${v.kids.stars} ★ · ${islandsLabel(decksFor(v, "kids").length)}`;
          else {
            const c = counts(decksFor(v, "adults"), v, today);
            stat = `${c.learned} poznanych · ${c.due + c.fresh} na dziś`;
          }
          return (
            <button key={p.id} className={`profile${p.kind === "kids" ? " profile-kids" : ""}${manage ? " profile-manage" : ""}`} onClick={() => (manage ? setForm({ mode: "edit", id: p.id }) : updateHousehold((x) => selectProfile(x, p.id)))}>
              <span className="profile-art profile-avatar" aria-hidden="true">{p.avatar}</span>
              <b>{p.name}</b>
              <span>{p.kind === "kids" ? "Echo Kids" : "Echo"}</span>
              <small>{manage ? "Zmień lub usuń" : stat}</small>
            </button>
          );
        })}
        {!manage && (
          <button className="profile profile-add" onClick={() => setForm({ mode: "add" })}>
            <span className="profile-art" aria-hidden="true">+</span>
            <b>Dodaj profil</b>
            <span>Dla dorosłego albo dziecka</span>
          </button>
        )}
      </div>
      <div className="chooser-foot">
        <button className="btn btn-quiet" onClick={() => setManage(!manage)}>{manage ? <><Icon name="check" /> Gotowe</> : <><Icon name="settings" /> Zarządzaj profilami</>}</button>
        <p>Wersja alfa · dane zostają na tym urządzeniu</p>
      </div>
    </main>
  );
}

const MIC_PROBLEMS: Record<ListenError, string> = {
  permission: "Brak zgody na mikrofon. Zezwól na niego w ustawieniach urządzenia lub przeglądarki.",
  unavailable: "To urządzenie nie rozpoznaje mowy.",
  network: "Rozpoznawanie mowy potrzebuje internetu.",
  language: "Brak rozpoznawania angielskiego. Dodaj język angielski w ustawieniach rozpoznawania mowy.",
  busy: "Mikrofon jest zajęty. Spróbuj za chwilę.",
  other: "Nie udało się posłuchać. Spróbuj jeszcze raz.",
};

/** Explains where the child's voice goes and lets the parent check the microphone. */
function MicNote({ on, accent }: { on: boolean; accent: string }) {
  const [test, setTest] = useState<string>("");
  useEffect(() => () => stopListening(), []);
  if (!canListen()) return <p className="hint">Na tym urządzeniu Echo jeszcze nie rozpoznaje mowy (na razie działa na Androidzie i w Chrome lub Edge).</p>;
  if (!on) return null;
  const check = async () => {
    setTest("Powiedz coś po angielsku, np. „hello”…");
    const r = await listen(accent);
    setTest(r.kind === "heard" ? `Echo usłyszało: „${r.texts[0]}”. Mikrofon działa.` : r.kind === "silence" ? "Nic nie słychać. Spróbuj jeszcze raz, bliżej mikrofonu." : r.kind === "error" ? MIC_PROBLEMS[r.reason] : "");
  };
  return (
    <div className="field mic-note">
      <p className="hint">Głos dziecka rozpoznaje system (na Androidzie zwykle Google, przez internet). Echo nie nagrywa i nie zapisuje głosu.</p>
      <div className="row">
        <button type="button" className="btn btn-quiet" onClick={() => void check()}><Icon name="mic" /> Sprawdź mikrofon</button>
        {test && <span className="hint" role="status">{test}</span>}
      </div>
    </div>
  );
}

function ProfileForm({ profile, first, onClose }: { profile?: Profile; first: boolean; onClose: () => void }) {
  const [name, setName] = useState(profile?.name ?? "");
  const [kind, setKind] = useState<Audience>(profile?.kind ?? "adults");
  const [avatar, setAvatar] = useState(profile?.avatar ?? AVATARS[0]);
  const [confirm, setConfirm] = useState(false);
  const [sounds, setSounds] = useState(profile?.settings.sounds !== false);
  const [openAll, setOpenAll] = useState(profile?.settings.kidsOpenAll === true);
  const [kidsVoice, setKidsVoice] = useState(profile?.settings.kidsVoice === true);
  const ok = cleanName(name) !== "";

  const save = () => {
    if (!ok) return;
    updateHousehold((h) => {
      if (profile) return editProfile(h, profile.id, { name, avatar, ...(profile.kind === "kids" ? { kidsOptions: { sounds, kidsOpenAll: openAll, kidsVoice } } : {}) });
      const next = addProfile(h, name, kind, avatar);
      // The very first profile starts learning straight away.
      return first ? selectProfile(next, next.profiles[next.profiles.length - 1].id) : next;
    });
    onClose();
  };
  return (
    <main className="chooser">
      <form className="panel form profile-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h1>{profile ? "Zmień profil" : first ? "Witaj w Echo" : "Nowy profil"}</h1>
        {first && <p className="sub">Każda osoba ma własny profil i własne postępy. Talie są wspólne.</p>}
        <label className="field" htmlFor="profile-name"><span>Imię</span>
          <input id="profile-name" value={name} maxLength={MAX_NAME} autoComplete="off" autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        {!profile && (
          <div className="field"><span>Kto</span>
            <div className="seg" role="group" aria-label="Rodzaj profilu">
              <button type="button" aria-pressed={kind === "adults"} onClick={() => setKind("adults")}>Dorosły · Echo</button>
              <button type="button" aria-pressed={kind === "kids"} onClick={() => setKind("kids")}>Dziecko · Echo Kids</button>
            </div>
          </div>
        )}
        <div className="field"><span>Obrazek</span>
          <div className="avatars" role="radiogroup" aria-label="Obrazek profilu">
            {AVATARS.map((a) => <button type="button" key={a} role="radio" aria-checked={a === avatar} onClick={() => setAvatar(a)}>{a}</button>)}
          </div>
        </div>
        {profile?.kind === "kids" && (
          <>
            <label className="field field-check" htmlFor="profile-sounds"><span>Dźwięki gry</span>
              <input id="profile-sounds" type="checkbox" checked={sounds} onChange={(e) => setSounds(e.target.checked)} />
            </label>
            <label className="field field-check" htmlFor="profile-open-all"><span>Wszystkie wyspy otwarte od razu</span>
              <input id="profile-open-all" type="checkbox" checked={openAll} onChange={(e) => setOpenAll(e.target.checked)} />
            </label>
            <label className="field field-check" htmlFor="profile-voice"><span>Mów z Echo: dziecko mówi słówka do mikrofonu</span>
              <input id="profile-voice" type="checkbox" checked={kidsVoice} disabled={!canListen()} onChange={(e) => setKidsVoice(e.target.checked)} />
            </label>
            <MicNote on={kidsVoice} accent={profile.settings.accent} />
          </>
        )}
        <div className="row">
          <button className="btn" type="submit" disabled={!ok}><Icon name="check" /> {profile ? "Zapisz" : "Dodaj profil"}</button>
          {!first && <button className="btn btn-quiet" type="button" onClick={onClose}>Anuluj</button>}
        </div>
        {profile && (
          <div className="row">
            {confirm ? (
              <>
                <span className="sub">Usunąć profil {profile.name} razem z postępami? Tego nie da się cofnąć.</span>
                <button className="btn btn-danger" type="button" onClick={() => { updateHousehold((h) => removeProfile(h, profile.id)); onClose(); }}>Usuń profil</button>
              </>
            ) : (
              <button className="btn btn-quiet" type="button" onClick={() => setConfirm(true)}><Icon name="trash" /> Usuń profil</button>
            )}
          </div>
        )}
      </form>
    </main>
  );
}
