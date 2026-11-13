// State storage port. The state is a single JSON document.
// - Native app (Tauri): a file in the app data directory (state.json), written atomically, plus a
//   copy in localStorage. The WebView may clear localStorage; the file survives app updates.
// - Browser: localStorage.
// - Claude artifact: localStorage plus a copy in the user's account, so progress follows the user.
import { isTauri } from "@tauri-apps/api/core";
import { BaseDirectory, mkdir, readDir, readTextFile, remove, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { backupDay, backupPlan } from "../core/backups";

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

const FILE = "state.json";
const BACKUPS = "backups";
const appData = { baseDir: BaseDirectory.AppData };
const native = (): boolean => __ECHO_TARGET__ !== "artifact" && isTauri();

async function readFile(): Promise<string | null> {
  try {
    return await readTextFile(FILE, appData);
  } catch {
    return null; // first start, or no file yet
  }
}

let fileQueue: Promise<unknown> = Promise.resolve();
let dirReady: Promise<unknown> | null = null;
const ensureDir = () => (dirReady ??= mkdir(BACKUPS, { ...appData, recursive: true }));

/** Writes to a temporary file and renames it, so a crash mid-write never leaves half a state. Writes run one at a time. */
function writeFile(name: string, json: string): Promise<boolean> {
  const run = fileQueue.then(async () => {
    try {
      await ensureDir();
      await writeTextFile(`${name}.tmp`, json, appData);
      await rename(`${name}.tmp`, name, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData });
      return true;
    } catch {
      dirReady = null;
      return false;
    }
  });
  fileQueue = run;
  return run;
}

export async function loadState(): Promise<string | null> {
  if (native()) {
    const json = await readFile();
    if (json) {
      memory = { json, savedAt: Date.now() };
      return json;
    }
    // No file yet: alpha 0.1 kept the state in localStorage only, so take it from there.
  }
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
  const local = writeLocal();
  return native() ? writeFile(FILE, json) : local;
}

/** Automatic backups exist only in the native app. */
export const autoBackups = (): boolean => native();

/** Writes today's backup (once a day) and removes old ones. */
export async function dailyBackup(today: string, backupJson: () => string): Promise<void> {
  if (!native()) return;
  try {
    await ensureDir();
    const names = (await readDir(BACKUPS, appData)).filter((e) => e.isFile).map((e) => e.name);
    const plan = backupPlan(names, today);
    if (plan.write) await writeFile(`${BACKUPS}/${plan.write}`, backupJson());
    for (const n of plan.remove) await remove(`${BACKUPS}/${n}`, appData).catch(() => undefined);
  } catch {
    // A backup is a safety net; failing to write one must not stop the app.
  }
}

/** Automatic backups, newest first. */
export async function listBackups(): Promise<{ name: string; day: string }[]> {
  if (!native()) return [];
  try {
    const entries = await readDir(BACKUPS, appData);
    return entries.flatMap((e) => {
      const day = e.isFile ? backupDay(e.name) : null;
      return day ? [{ name: e.name, day }] : [];
    }).sort((a, b) => b.day.localeCompare(a.day));
  } catch {
    return [];
  }
}

export const readBackup = (name: string): Promise<string> => readTextFile(`${BACKUPS}/${name}`, appData);
