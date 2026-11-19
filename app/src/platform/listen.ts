// Speech recognition port for the voice mode. On Android the WebView has no Web Speech API, so the
// native shell (src-tauri/android/MainActivity.kt, window.EchoAndroid) runs the system
// SpeechRecognizer and reports back with "echo-speech" events. In a browser (Chrome, Edge) it uses
// the Web Speech API. Windows and macOS builds have neither yet, so the voice mode offers listening only.

export type ListenError = "permission" | "unavailable" | "network" | "language" | "busy" | "other";

export type ListenResult =
  | { kind: "heard"; texts: string[] }
  | { kind: "silence" }
  | { kind: "error"; reason: ListenError }
  | { kind: "aborted" };

export type ListenOptions = {
  signal?: AbortSignal;
  /** Words recognised so far, while the person is still speaking. */
  onPartial?: (text: string) => void;
  /** The microphone is open. */
  onReady?: () => void;
};

type Bridge = {
  speechAvailable?(): boolean;
  listen?(lang: string, id: string): string;
  stopListening?(): void;
  keepScreenOn?(on: boolean): void;
};

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
  start(): void;
  abort(): void;
};

const bridge = (): Bridge | undefined => (typeof window === "undefined" ? undefined : (window as unknown as { EchoAndroid?: Bridge }).EchoAndroid);

const WebRecognition = (): (new () => Recognition) | undefined => {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

const native = (): boolean => typeof bridge()?.listen === "function";

/** True when the Android shell does the listening (permissions are then Android's, not the browser's). */
export const listensNatively = native;

/** Whether this device can hear spoken answers. */
export function canListen(): boolean {
  try {
    if (native()) return bridge()?.speechAvailable?.() !== false;
  } catch {
    return false;
  }
  return !!WebRecognition();
}

let seq = 0;
let current: (() => void) | null = null;

/** Stops listening; the pending listen() resolves with "aborted". */
export function stopListening(): void {
  current?.();
}

/**
 * Listens for one answer. Resolves with what was heard (the engine's alternatives, best first),
 * with silence when nobody spoke, or with an error. `lang` is a BCP 47 tag such as "pl-PL" or "en-GB".
 */
export function listen(lang: string, opts: ListenOptions = {}): Promise<ListenResult> {
  stopListening();
  if (opts.signal?.aborted) return Promise.resolve({ kind: "aborted" });
  return native() ? listenNative(lang, opts) : listenWeb(lang, opts);
}

function listenNative(lang: string, opts: ListenOptions): Promise<ListenResult> {
  const id = `l${++seq}`;
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: ListenResult) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("echo-speech", onEvent);
      opts.signal?.removeEventListener("abort", abort);
      clearTimeout(guard);
      if (current === stop) current = null;
      resolve(r);
    };
    const stop = () => {
      try {
        bridge()?.stopListening?.();
      } catch {
        // The shell is gone; nothing to stop.
      }
      done({ kind: "aborted" });
    };
    const abort = () => stop();
    const onEvent = (e: Event) => {
      let d: { id?: string; type?: string; texts?: string[]; error?: string };
      try {
        const raw = (e as CustomEvent).detail;
        d = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        return;
      }
      if (d.id !== id) return;
      const texts = Array.isArray(d.texts) ? d.texts.filter((t) => typeof t === "string") : [];
      if (d.type === "ready") opts.onReady?.();
      else if (d.type === "partial" && texts[0]) opts.onPartial?.(texts[0]);
      else if (d.type === "result") done(texts.length ? { kind: "heard", texts } : { kind: "silence" });
      else if (d.type === "error") done(d.error === "silence" ? { kind: "silence" } : { kind: "error", reason: errorOf(d.error) });
    };
    // A recogniser that never answers must not hang the session.
    const giveUp = () => {
      try {
        bridge()?.stopListening?.();
      } catch {
        // ignore
      }
      done({ kind: "silence" });
    };
    let guard = setTimeout(giveUp, 30000);
    current = stop;
    window.addEventListener("echo-speech", onEvent);
    opts.signal?.addEventListener("abort", abort);
    let started = "";
    try {
      started = bridge()?.listen?.(lang, id) ?? "";
    } catch {
      started = "";
    }
    if (started === "unavailable" || started === "") done({ kind: "error", reason: "unavailable" });
    // "permission": Android is asking for the microphone; the answer arrives as an event, so give the person time.
    else if (started === "permission") {
      clearTimeout(guard);
      guard = setTimeout(giveUp, 120000);
    }
  });
}

function errorOf(code?: string): ListenError {
  return code === "permission" || code === "network" || code === "language" || code === "busy" || code === "unavailable" ? code : "other";
}

function listenWeb(lang: string, opts: ListenOptions): Promise<ListenResult> {
  const R = WebRecognition();
  if (!R) return Promise.resolve({ kind: "error", reason: "unavailable" });
  return new Promise((resolve) => {
    let settled = false;
    let texts: string[] = [];
    let failure: ListenResult | null = null;
    const r = new R();
    const done = (res: ListenResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      opts.signal?.removeEventListener("abort", stop);
      if (current === stop) current = null;
      resolve(res);
    };
    // A recogniser that never ends (no microphone, a blocked permission prompt) must not hang the session.
    const guard = setTimeout(() => {
      try {
        r.abort();
      } catch {
        // ignore
      }
      done(texts.length ? { kind: "heard", texts } : { kind: "silence" });
    }, 30000);
    const stop = () => {
      try {
        r.abort();
      } catch {
        // already stopped
      }
      done({ kind: "aborted" });
    };
    r.lang = lang;
    r.interimResults = true;
    r.maxAlternatives = 5;
    r.continuous = false;
    r.onaudiostart = () => opts.onReady?.();
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) texts = Array.from({ length: res.length }, (_, k) => res[k].transcript.trim()).filter(Boolean);
        else if (res[0]?.transcript) opts.onPartial?.(res[0].transcript);
      }
    };
    r.onerror = (e) => {
      const map: Record<string, ListenResult> = {
        "no-speech": { kind: "silence" },
        aborted: { kind: "aborted" },
        "not-allowed": { kind: "error", reason: "permission" },
        "service-not-allowed": { kind: "error", reason: "permission" },
        "audio-capture": { kind: "error", reason: "unavailable" },
        network: { kind: "error", reason: "network" },
        "language-not-supported": { kind: "error", reason: "language" },
      };
      failure = map[e.error] ?? { kind: "error", reason: "other" };
    };
    r.onend = () => done(texts.length ? { kind: "heard", texts } : failure ?? { kind: "silence" });
    current = stop;
    opts.signal?.addEventListener("abort", stop);
    try {
      r.start();
    } catch {
      done({ kind: "error", reason: "busy" });
    }
  });
}

let wakeLock: { release(): Promise<void> } | null = null;

/** Keeps the screen on during a voice session; a locked phone would stop speaking and listening. */
export async function keepScreenOn(on: boolean): Promise<void> {
  try {
    const b = bridge();
    if (b?.keepScreenOn) return b.keepScreenOn(on);
    const nav = navigator as unknown as { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
    if (on && !wakeLock && nav.wakeLock) wakeLock = await nav.wakeLock.request("screen");
    if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    // Not available here; the session still works while the screen is on.
  }
}
