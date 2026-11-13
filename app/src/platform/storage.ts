// Port zapisu stanu. W wersji alfa stan to jeden dokument JSON w localStorage
// (działa w przeglądarce i w WebView Tauri). Wersja uruchomiona jako artefakt Claude
// dodatkowo trzyma kopię na koncie użytkownika, więc postępy są te same na każdym urządzeniu.
// Docelowo: plik w katalogu danych aplikacji i własna synchronizacja.
const KEY = "echo.state.v1";
const STAMP = "echo.state.v1.savedAt";
let memory: { json: string; savedAt: number } | null = null;

type DocRef = { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void> };
type ClaudeRuntime = { use(name: string): Promise<unknown> };

let cloud: Promise<DocRef | null> | null = null;
function cloudDoc(): Promise<DocRef | null> {
  cloud ??= (async () => {
    try {
      const claude = (window as unknown as { claude?: ClaudeRuntime }).claude;
      if (!claude?.use) return null;
      const [db, user] = (await Promise.all([claude.use("db"), claude.use("user")])) as [{ doc(p: string): DocRef } | null, { id(): Promise<string | null> } | null];
      const uid = await user?.id();
      return db && uid ? db.doc(`data/users/${uid}/state`) : null;
    } catch {
      return null;
    }
  })();
  return cloud;
}

export async function loadState(): Promise<string | null> {
  try {
    const json = localStorage.getItem(KEY);
    if (json) memory = { json, savedAt: Number(localStorage.getItem(STAMP)) || 0 };
  } catch {
    // Brak dostępu do localStorage: zostaje pamięć tej sesji.
  }
  return memory?.json ?? null;
}

/** Stan z konta, jeśli jest nowszy niż lokalny (inaczej null). Może odpowiedzieć po kilku sekundach. */
export async function loadNewerRemote(): Promise<string | null> {
  try {
    const snap = await (await cloudDoc())?.get();
    const d = snap?.exists ? snap.data() : undefined;
    if (!d || typeof d.json !== "string" || typeof d.savedAt !== "number") return null;
    if (d.savedAt <= (memory?.savedAt ?? 0)) return null;
    memory = { json: d.json, savedAt: d.savedAt };
    writeLocal();
    return d.json;
  } catch {
    return null;
  }
}

function writeLocal(): boolean {
  if (!memory) return false;
  try {
    localStorage.setItem(KEY, memory.json);
    localStorage.setItem(STAMP, String(memory.savedAt));
    return true;
  } catch {
    return false;
  }
}

let cloudTimer: ReturnType<typeof setTimeout> | undefined;

export async function saveState(json: string): Promise<boolean> {
  memory = { json, savedAt: Date.now() };
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(async () => {
    const snapshot = memory;
    try {
      if (snapshot) await (await cloudDoc())?.set({ json: snapshot.json, savedAt: snapshot.savedAt });
    } catch {
      // Zapis na koncie jest dodatkiem; lokalna kopia już istnieje.
    }
  }, 1500);
  return writeLocal();
}
