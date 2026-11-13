// State storage port. In the alpha the state is a single JSON document in localStorage
// (works in the browser and in the Tauri WebView). When running as a Claude artifact it also
// keeps a copy in the user's account, so progress is the same on every device.
// Target: a file in the app data directory and our own sync.
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
    // No access to localStorage: fall back to in-memory state for this session.
  }
  return memory?.json ?? null;
}

/** State from the account if it is newer than the local one (otherwise null). May take a few seconds to respond. */
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
      // Saving to the account is a bonus; the local copy already exists.
    }
  }, 1500);
  return writeLocal();
}
