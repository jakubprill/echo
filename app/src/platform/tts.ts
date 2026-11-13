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

export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  // Brackets and ellipses in entries ("to take a rain check (on sth)") are not meant to be read aloud.
  const clean = text.replace(/\(.*?\)/g, "").replace(/\.\.\./g, "").trim();
  if (!clean) return;
  try {
    if (!cache?.length) cache = await voices("en");
    const voice = pickVoice(cache.filter((v) => v.language.toLowerCase().startsWith("en")), opts.language ?? "en-GB", opts.voiceId);
    // Without an English voice the system would fall back to its default (e.g. Polish), so it is better to stay silent.
    if (!voice) return;
    if (isTauri()) {
      await native.stop().catch(() => {});
      await native.speak({ text: clean, language: voice.language, voiceId: voice.id, rate: opts.rate ?? 1 });
      return;
    }
    if (!hasWebSpeech()) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = voice.language;
    const v = speechSynthesis.getVoices().find((x) => x.voiceURI === voice.id);
    if (v) u.voice = v;
    u.rate = opts.rate ?? 1;
    speechSynthesis.speak(u);
  } catch {
    // Missing speech must never block studying.
  }
}
