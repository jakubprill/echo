// Short game sounds for the kids line, synthesised with the Web Audio API so the app ships
// no audio files (nothing to license). Works in browsers, WebView2 (Windows) and Android WebView.

type Ctor = typeof AudioContext;
let ctx: AudioContext | null = null;
let enabled = true;

/** The parent can turn game sounds off in Settings; speech is not affected. */
export function setSfxEnabled(on: boolean): void {
  enabled = on;
}

function audio(): AudioContext | null {
  if (!enabled || typeof window === "undefined") return null;
  const C: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!C) return null;
  try {
    ctx ??= new C();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "triangle", vol = 0.16): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const semis = (base: number, n: number) => base * Math.pow(2, n / 12);

export const sfx = {
  /** A right answer; the pitch climbs with the streak. */
  hit(streak = 1) {
    const b = semis(660, Math.min(Math.max(streak - 1, 0), 7));
    tone(b, 0, 0.15);
    tone(b * 1.5, 0.08, 0.25);
  },
  /** A gentle low "boop" for a wrong picture, never harsh. */
  miss() {
    tone(220, 0, 0.18, "sine", 0.14);
    tone(185, 0.12, 0.25, "sine", 0.1);
  },
  /** One of the round's stars landing (index 0–2). */
  star(i: number) {
    tone(semis(784, i * 4), 0, 0.35);
  },
  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, i === 3 ? 0.6 : 0.18, "square", 0.07));
  },
  /** The microphone opens: a short rising "your turn". */
  mic() {
    tone(587, 0, 0.09, "sine", 0.1);
    tone(880, 0.08, 0.14, "sine", 0.1);
  },
  /** A new lamp on the island or a whole island lit. */
  sparkle() {
    for (let i = 0; i < 6; i++) tone(semis(880, [0, 4, 7, 12, 16, 19][i]), i * 0.07, 0.3, "triangle", 0.09);
  },
};
