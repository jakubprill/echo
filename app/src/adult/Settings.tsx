import { useEffect, useState } from "react";
import { setLine } from "../App";
import { DeckError, exportBackup, parseBackup } from "../core/deck";
import type { Settings as S } from "../core/types";
import { canSaveFiles, copyText, pickTextFile, saveTextFile } from "../platform/files";
import { ttsAvailable, voices, type Voice } from "../platform/tts";
import { getState, replaceState, say, update, useAppState } from "../state/store";
import { Icon } from "../ui/icons";

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

  useEffect(() => {
    void voices("en").then(setList);
  }, []);
  const forAccent = list.filter((v) => v.language.toLowerCase() === st.accent.toLowerCase());

  const doExport = async () => {
    const text = exportBackup(getState());
    if (!canSaveFiles()) return setBackup(text);
    try {
      const r = await saveTextFile(`echo-kopia-${new Date().toISOString().slice(0, 10)}.json`, text);
      if (r === "saved") setMsg({ ok: true, text: "Zapisano kopię zapasową." });
    } catch {
      setBackup(text);
    }
  };
  const doImport = async () => {
    const f = await pickTextFile();
    if (!f) return;
    try {
      const line = getState().settings.line;
      const next = parseBackup(f.text);
      replaceState({ ...next, settings: { ...next.settings, line } });
      setMsg({ ok: true, text: "Wczytano kopię zapasową: talie, postępy i ustawienia." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof DeckError ? e.message : "Nie udało się wczytać kopii." });
    }
  };

  return (
    <div className="page">
      <header><h1>Ustawienia</h1></header>

      <section className="panel form">
        <h2>Lektor</h2>
        {!ttsAvailable() && <p className="notice notice-no">To urządzenie nie udostępnia lektora. Nauka działa bez dźwięku.</p>}
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
        <p className="sub">Postępy są zapisane tylko na tym urządzeniu. Kopia zapasowa przenosi talie, postępy i ustawienia na inne urządzenie.</p>
        <div className="row">
          <button className="btn btn-quiet" onClick={doExport}><Icon name="export" /> Zapisz kopię</button>
          <button className="btn btn-quiet" onClick={doImport}><Icon name="import" /> Wczytaj kopię</button>
          {confirm ? (
            <button className="btn btn-danger" onClick={() => { update((x) => ({ ...x, progress: {}, log: {}, kids: { stars: 0, words: {} } })); setConfirm(false); setMsg({ ok: true, text: "Postępy wyzerowane. Talie zostały." }); }}>Na pewno wyzeruj postępy</button>
          ) : (
            <button className="btn btn-quiet" onClick={() => setConfirm(true)}><Icon name="trash" /> Wyzeruj postępy</button>
          )}
        </div>
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
        <div className="row">
          <button className="btn btn-quiet" onClick={() => setLine("kids")}><Icon name="bat" /> Przejdź do Echo Kids</button>
          <button className="btn btn-quiet" onClick={() => setLine(null)}><Icon name="user" /> Wybór profilu</button>
        </div>
        <p className="sub">Echo, wersja alfa 0.1.0</p>
      </section>
    </div>
  );
}
