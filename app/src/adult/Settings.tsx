import { useEffect, useState } from "react";
import { leaveProfile } from "../App";
import { DeckError, exportBackup, parseBackup } from "../core/deck";
import { activeProfile, type Household } from "../core/profiles";
import type { Settings as S } from "../core/types";
import { canSaveFiles, copyText, pickTextFile, saveTextFile } from "../platform/files";
import { ttsAvailable, voices, type Voice } from "../platform/tts";
import { autoBackups, listBackups, readBackup } from "../platform/storage";
import { getHousehold, say, update, updateHousehold, useAppState, useHousehold } from "../state/store";
import { Icon } from "../ui/icons";
import { VoiceNotice } from "../ui/VoiceNotice";

const set = (patch: Partial<S>) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export function Settings() {
  const s = useAppState();
  const st = s.settings;
  const [list, setList] = useState<Voice[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [backup, setBackup] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [auto, setAuto] = useState<{ name: string; day: string }[]>([]);
  const [restore, setRestore] = useState<string | null>(null);
  const me = activeProfile(useHousehold());

  useEffect(() => {
    void voices("en").then(setList);
    void listBackups().then(setAuto);
  }, []);
  const forAccent = list.filter((v) => v.language.toLowerCase() === st.accent.toLowerCase());

  const doExport = async () => {
    const text = exportBackup(getHousehold());
    if (!canSaveFiles()) return setBackup(text);
    try {
      const r = await saveTextFile(`echo-kopia-${new Date().toISOString().slice(0, 10)}.json`, text);
      if (r === "saved") setMsg({ ok: true, text: "Zapisano kopię zapasową." });
    } catch {
      setBackup(text);
    }
  };
  /** Replaces all profiles and decks; stays in the current profile if the backup has it. */
  const load = (text: string, done: string) => {
    try {
      const next = parseBackup(text);
      const current = getHousehold().active;
      updateHousehold((): Household => ({ ...next, active: next.profiles.some((p) => p.id === current) ? current : null }));
      setMsg({ ok: true, text: done });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof DeckError ? e.message : "Nie udało się wczytać kopii." });
    }
  };
  const doImport = async () => {
    const f = await pickTextFile();
    if (f) load(f.text, "Wczytano kopię zapasową: profile, talie i postępy.");
  };
  const doRestore = async (name: string, day: string) => {
    setRestore(null);
    try {
      load(await readBackup(name), `Przywrócono stan z ${day}.`);
    } catch {
      setMsg({ ok: false, text: "Nie udało się odczytać tej kopii." });
    }
  };

  return (
    <div className="page">
      <header><h1>Ustawienia</h1></header>

      <section className="panel form">
        <h2>Lektor</h2>
        {!ttsAvailable() && <p className="notice notice-no">To urządzenie nie udostępnia lektora. Nauka działa bez dźwięku.</p>}
        <VoiceNotice />
        <div className="field"><span>Akcent</span><Seg label="Akcent" value={st.accent} options={[["en-GB", "Brytyjski"], ["en-US", "Amerykański"]]} onChange={(accent) => set({ accent, voiceId: null })} /></div>
        <label className="field" htmlFor="set-voice"><span>Głos</span>
          <select id="set-voice" value={st.voiceId ?? ""} onChange={(e) => set({ voiceId: e.target.value || null })}>
            <option value="">Domyślny dla akcentu</option>
            {(forAccent.length ? forAccent : list).map((v) => <option key={v.id} value={v.id}>{v.name} ({v.language})</option>)}
          </select>
        </label>
        <label className="field" htmlFor="set-rate"><span>Tempo: {st.rate.toFixed(2).replace(".", ",")}×</span>
          <input id="set-rate" type="range" min="0.6" max="1.2" step="0.05" value={st.rate} onChange={(e) => set({ rate: Number(e.target.value) })} />
        </label>
        <label className="field field-check" htmlFor="set-auto"><span>Czytaj słówko po pokazaniu karty</span>
          <input id="set-auto" type="checkbox" checked={st.autoSpeak} onChange={(e) => set({ autoSpeak: e.target.checked })} />
        </label>
        <div><button className="btn btn-quiet" onClick={() => say("It was pure serendipity that we met in Lisbon.")}><Icon name="speaker" /> Wypróbuj głos</button></div>
      </section>

      <section className="panel form">
        <h2>Nauka</h2>
        <div className="field"><span>Nowe słówka dziennie</span>
          <div className="stepper">
            <button onClick={() => set({ newPerDay: Math.max(0, st.newPerDay - 5) })} aria-label="Mniej nowych słówek">−</button>
            <b>{st.newPerDay}</b>
            <button onClick={() => set({ newPerDay: Math.min(50, st.newPerDay + 5) })} aria-label="Więcej nowych słówek">+</button>
          </div>
        </div>
        <div className="field"><span>Wygląd</span><Seg label="Wygląd" value={st.theme} options={[["system", "Jak system"], ["light", "Jasny"], ["dark", "Ciemny"]]} onChange={(theme) => set({ theme })} /></div>
      </section>

      <section className="panel form">
        <h2>Dane</h2>
        <p className="sub">Postępy wszystkich profili są zapisane na tym urządzeniu. Kopia zapasowa przenosi profile, talie i postępy na inne urządzenie.</p>
        <div className="row">
          <button className="btn btn-quiet" onClick={doExport}><Icon name="export" /> Zapisz kopię</button>
          <button className="btn btn-quiet" onClick={doImport}><Icon name="import" /> Wczytaj kopię</button>
          {confirm ? (
            <button className="btn btn-danger" onClick={() => { update((x) => ({ ...x, progress: {}, log: {}, kids: { stars: 0, words: {} } })); setConfirm(false); setMsg({ ok: true, text: "Postępy tego profilu wyzerowane. Talie i inne profile zostały." }); }}>Na pewno wyzeruj postępy: {me?.name}</button>
          ) : (
            <button className="btn btn-quiet" onClick={() => setConfirm(true)}><Icon name="trash" /> Wyzeruj postępy</button>
          )}
        </div>
        {autoBackups() && (
          <div className="autobackups">
            <h3>Automatyczne kopie</h3>
            <p className="sub">Echo zapisuje kopię raz dziennie i trzyma pięć ostatnich.</p>
            {auto.length === 0 ? <p className="sub">Pierwsza kopia pojawi się po ponownym uruchomieniu.</p> : (
              <ul>
                {auto.map((b) => (
                  <li key={b.name}>
                    <span>{b.day}</span>
                    {restore === b.name ? (
                      <button className="btn btn-danger" onClick={() => void doRestore(b.name, b.day)}>Na pewno przywróć</button>
                    ) : (
                      <button className="btn btn-quiet" onClick={() => setRestore(b.name)}>Przywróć</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {msg && <p className={`notice ${msg.ok ? "notice-ok" : "notice-no"}`} role="status">{msg.text}</p>}
        {backup && (
          <div className="backup">
            <p className="sub">Ta wersja nie może zapisać pliku. Skopiuj tekst i zapisz go jako plik .json.</p>
            <textarea id="backup-text" readOnly value={backup} rows={5} onFocus={(e) => e.currentTarget.select()} aria-label="Kopia zapasowa jako tekst" />
            <button className="btn btn-quiet" onClick={async () => setMsg((await copyText(backup)) ? { ok: true, text: "Skopiowano do schowka." } : { ok: false, text: "Nie udało się skopiować. Zaznacz tekst i skopiuj ręcznie." })}>Kopiuj do schowka</button>
          </div>
        )}
      </section>

      <section className="panel form">
        <h2>Profil</h2>
        <p className="sub">Uczysz się jako {me?.avatar} {me?.name}. Lektor i tempo nauki są ustawione osobno dla każdego profilu.</p>
        <div className="row">
          <button className="btn btn-quiet" onClick={leaveProfile}><Icon name="user" /> Zmień profil</button>
        </div>
        <p className="sub">Echo {__ECHO_VERSION__}</p>
      </section>
    </div>
  );
}
