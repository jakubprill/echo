// Self-update on Android: asks GitHub Releases for a newer version, downloads the APK with the
// system DownloadManager and opens the system installer. The native side lives in
// src-tauri/android/MainActivity.kt (window.EchoAndroid). Android always asks the user to
// confirm an install from outside the Play Store; the APK is signed with the same stable key
// as the installed app, so it installs over it and keeps all data.
import { useSyncExternalStore } from "react";
import { newestUpdate, RELEASES_API, type Update } from "../core/update";

type Bridge = {
  downloadUpdate?(url: string, name: string): string;
  updateStatus?(id: string): string;
  installUpdate?(id: string): string;
  cleanupUpdates?(): void;
};

const bridge = (): Bridge | undefined => (window as unknown as { EchoAndroid?: Bridge }).EchoAndroid;

/** True in an Android build whose shell can download and install updates. */
export const canSelfUpdate = (): boolean => __ECHO_TARGET__ !== "artifact" && typeof bridge()?.downloadUpdate === "function";

export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "latest" }
  | { phase: "offline" }
  | { phase: "available"; update: Update }
  | { phase: "downloading"; update: Update; done: number; total: number }
  | { phase: "installing"; update: Update; id: string }
  | { phase: "permission"; update: Update; id: string }
  | { phase: "failed"; update: Update };

let state: UpdateState = { phase: "idle" };
const listeners = new Set<() => void>();
const set = (next: UpdateState) => {
  state = next;
  listeners.forEach((l) => l());
};

export function useUpdate(): UpdateState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Asks GitHub for a newer release. Quiet checks (on start) leave no trace when offline. */
export async function checkForUpdate(quiet = false): Promise<void> {
  if (!canSelfUpdate() || state.phase === "checking" || state.phase === "downloading") return;
  const before = state;
  set({ phase: "checking" });
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" }, signal: ctl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const update = newestUpdate(await res.json(), __ECHO_VERSION__);
    if (update) return set({ phase: "available", update });
    set({ phase: quiet ? "idle" : "latest" });
    // Up to date: an APK downloaded earlier has been installed (or is obsolete), so free the space.
    try {
      bridge()?.cleanupUpdates?.();
    } catch {
      // Older shells have no such method.
    }
  } catch {
    set(quiet ? before : { phase: "offline" });
  }
}

/** Downloads the update, then hands it to the system installer. */
export function installUpdate(): void {
  const s = state;
  const b = bridge();
  if (!b?.downloadUpdate || !b.updateStatus) return;
  if (s.phase === "permission" || s.phase === "installing") return openInstaller(s.update, s.id);
  if (s.phase !== "available" && s.phase !== "failed") return;
  const update = s.update;
  let id = "";
  try {
    id = b.downloadUpdate(update.url, update.name);
  } catch {
    id = "";
  }
  if (!id) return set({ phase: "failed", update });
  set({ phase: "downloading", update, done: 0, total: update.size });
  const poll = setInterval(() => {
    let st: { state?: string; done?: number; total?: number } = {};
    try {
      st = JSON.parse(b.updateStatus!(id));
    } catch {
      st = { state: "failed" };
    }
    if (st.state === "running") {
      set({ phase: "downloading", update, done: Number(st.done) || 0, total: Number(st.total) > 0 ? Number(st.total) : update.size });
      return;
    }
    clearInterval(poll);
    if (st.state === "done") openInstaller(update, id);
    else set({ phase: "failed", update });
  }, 500);
}

// The shell reports here when the installer could not be opened after all.
if (typeof window !== "undefined") {
  window.addEventListener("echo-update-failed", () => {
    if (state.phase === "installing") set({ phase: "failed", update: state.update });
  });
}

function openInstaller(update: Update, id: string) {
  let r = "failed";
  try {
    r = bridge()?.installUpdate?.(id) ?? "failed";
  } catch {
    r = "failed";
  }
  if (r === "started") set({ phase: "installing", update, id });
  else if (r === "permission") set({ phase: "permission", update, id });
  else set({ phase: "failed", update });
}
