// Speech port. In the Tauri app it uses the system's native text-to-speech
// (Android TextToSpeech, iOS/macOS AVSpeechSynthesizer, Windows WinRT);
// in the browser, the Web Speech API. The rest of the app only knows this module.
import { isTauri } from "@tauri-apps/api/core";
import * as native from "tauri-plugin-tts-api";

export type Voice = { id: string; name: string; language: string };
export type SpeakOptions = { language?: string; voiceId?: string | null; rate?: number };

const hasWebSpeech = () => typeof window !== "undefined" && "speechSynthesis" in window;

export function ttsAvailable(): boolean {
  return isTauri() || hasWebSpeech();
}

async function webVoices(): Promise<SpeechSynthesisVoice[]> {
  const now = speechSynthesis.getVoices();
  if (now.length) return now;
  // Chrome loads the voice list asynchronously.
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

export async function voices(lang = "en"): Promise<Voice[]> {
  try {
    if (isTauri()) {
      for (let i = 0; i < 25; i++) {
        const s = await native.isInitialized();
        if (s.initialized && s.voiceCount > 0) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      return await native.getVoices(lang);
    }
    if (!hasWebSpeech()) return [];
    return (await webVoices())
      .filter((v) => v.lang.toLowerCase().startsWith(lang))
      .map((v) => ({ id: v.voiceURI, name: v.name, language: v.lang.replace("_", "-") }));
  } catch {
    return [];
  }
}

/** Picks a voice: the one the user chose, otherwise the first one matching the accent. */
export function pickVoice(list: Voice[], accent: string, voiceId?: string | null): Voice | undefined {
  return list.find((v) => v.id === voiceId) ?? list.find((v) => v.language.toLowerCase() === accent.toLowerCase()) ?? list[0];
}

let cache: Voice[] | null = null;

/** Whether the system has any English voice. Without one, speech stays silent instead of reading English with a Polish voice. */
export async function hasEnglishVoice(): Promise<boolean> {
  if (!ttsAvailable()) return false;
  const list = await voices("en");
  if (list.length) cache = list;
  return list.some((v) => v.language.toLowerCase().startsWith("en"));
}

let polish: Voice[] | null = null;

/** Whether the system has a Polish voice (the voice mode reads Polish words aloud). */
export async function hasPolishVoice(): Promise<boolean> {
  if (!ttsAvailable()) return false;
  polish = await voices("pl");
  return polish.length > 0;
}

type Started = { utteranceId?: string | null; utterance?: SpeechSynthesisUtterance } | null;

/** Starts speaking. English by default; `polish` reads Polish text with a Polish voice. */
async function start(text: string, opts: SpeakOptions, polishText: boolean): Promise<Started> {
  // Brackets and ellipses in entries ("to take a rain check (on sth)") are not meant to be read aloud.
  const clean = text.replace(/\(.*?\)/g, "").replace(/\.\.\./g, "").trim();
  if (!clean) return null;
  let voice: Voice | undefined;
  if (polishText) {
    // Asked once: without a Polish voice every Polish word would otherwise wait for the voice list again.
    if (polish === null) polish = await voices("pl");
    voice = pickVoice(polish, "pl-PL");
  } else {
    if (!cache?.length) cache = await voices("en");
    voice = pickVoice(cache.filter((v) => v.language.toLowerCase().startsWith("en")), opts.language ?? "en-GB", opts.voiceId);
  }
  // Without a voice for the language the system would fall back to its default (e.g. Polish for English), so it is better to stay silent.
  if (!voice) return null;
  if (isTauri()) {
    await native.stop().catch(() => {});
    const r = await native.speak({ text: clean, language: voice.language, voiceId: voice.id, rate: opts.rate ?? 1 });
    return { utteranceId: r.utteranceId };
  }
  if (!hasWebSpeech()) return null;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = voice.language;
  const v = speechSynthesis.getVoices().find((x) => x.voiceURI === voice.id);
  if (v) u.voice = v;
  u.rate = opts.rate ?? 1;
  speechSynthesis.speak(u);
  return { utterance: u };
}

export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  try {
    await start(text, opts, false);
  } catch {
    // Missing speech must never block studying.
  }
}

/** Stops whatever is being said. */
export function stopSpeaking(): void {
  try {
    if (isTauri()) void native.stop().catch(() => {});
    else if (hasWebSpeech()) speechSynthesis.cancel();
  } catch {
    // Nothing to stop.
  }
}

/**
 * Says a text and resolves when it has been said, so the microphone does not hear the app itself.
 * Resolves early when `signal` aborts, and never takes longer than a generous estimate, because
 * some engines do not report the end of an utterance.
 */
export async function speakAndWait(text: string, opts: SpeakOptions & { polish?: boolean; signal?: AbortSignal } = {}): Promise<void> {
  if (opts.signal?.aborted) return;
  const rate = opts.rate ?? 1;
  const limit = 2500 + (text.length * 120) / Math.max(0.3, rate);
  let over = false;
  let finish = () => {};
  const done = new Promise<void>((resolve) => (finish = () => {
    over = true;
    resolve();
  }));
  const cleanup: (() => void)[] = [];
  const timer = setTimeout(() => finish(), limit);
  cleanup.push(() => clearTimeout(timer));
  const abort = () => finish();
  opts.signal?.addEventListener("abort", abort);
  cleanup.push(() => opts.signal?.removeEventListener("abort", abort));
  try {
    let id: string | null | undefined;
    if (isTauri()) {
      // Lifecycle events are the quick path; polling isSpeaking() covers engines that do not send them.
      for (const type of ["speech:finish", "speech:cancel", "speech:error"] as const)
        void native
          .onSpeechEvent(type, (e) => {
            if (!id || !e.id || e.id === id) finish();
          })
          .then((un) => (over ? un() : cleanup.push(un)))
          .catch(() => {});
    }
    const started = await start(text, opts, !!opts.polish);
    if (!started) finish();
    else if (started.utterance) {
      started.utterance.onend = () => finish();
      started.utterance.onerror = () => finish();
    } else {
      id = started.utteranceId;
      const t0 = Date.now();
      let seen = false;
      const poll = setInterval(() => {
        void native
          .isSpeaking()
          .then((speaking) => {
            if (speaking) seen = true;
            else if (seen || Date.now() - t0 > 1500) finish();
          })
          .catch(() => {});
      }, 200);
      cleanup.push(() => clearInterval(poll));
    }
  } catch {
    finish();
  }
  await done;
  cleanup.forEach((c) => c());
}
