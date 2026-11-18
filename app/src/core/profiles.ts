// Profiles: several adults and several children learn on one device.
// Decks are shared by the whole household; progress, daily log, stars and settings belong to a profile.
// Screens keep working on AppState, which is the active profile seen together with the shared decks.
import { defaultState, type AppState, type Audience, type CardProgress, type DayLog, type KidsWord, type Settings } from "./types";
import type { Deck } from "./types";

export type Profile = {
  id: string;
  name: string;
  kind: Audience;
  avatar: string;
  progress: Record<string, CardProgress>;
  log: Record<string, DayLog>;
  kids: { stars: number; words: Record<string, KidsWord> };
  settings: Settings;
};

export type Household = {
  schema: 2;
  decks: Deck[];
  profiles: Profile[];
  /** Profile that is learning right now; null shows the profile chooser. */
  active: string | null;
};

export const AVATARS = ["🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐸", "🐙", "🦉", "🐢", "🐳", "🦄"];
export const MAX_NAME = 24;

export const emptyHousehold = (): Household => ({ schema: 2, decks: [], profiles: [], active: null });

const freshProfile = (id: string, name: string, kind: Audience, avatar: string): Profile => {
  const d = defaultState();
  return { id, name, kind, avatar, progress: {}, log: {}, kids: d.kids, settings: { ...d.settings, line: kind } };
};

const newId = (h: Household): string => {
  let n = h.profiles.length + 1;
  while (h.profiles.some((p) => p.id === `p${n}`)) n++;
  return `p${n}`;
};

export const cleanName = (name: string): string => name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);

export function addProfile(h: Household, name: string, kind: Audience, avatar: string): Household {
  const clean = cleanName(name);
  if (!clean) return h;
  const p = freshProfile(newId(h), clean, kind, avatar);
  return { ...h, profiles: [...h.profiles, p] };
}

export function editProfile(h: Household, id: string, patch: { name?: string; avatar?: string }): Household {
  const name = patch.name === undefined ? undefined : cleanName(patch.name);
  if (name === "") return h;
  return { ...h, profiles: h.profiles.map((p) => (p.id === id ? { ...p, ...(name ? { name } : {}), ...(patch.avatar ? { avatar: patch.avatar } : {}) } : p)) };
}

export function removeProfile(h: Household, id: string): Household {
  return { ...h, profiles: h.profiles.filter((p) => p.id !== id), active: h.active === id ? null : h.active };
}

export function selectProfile(h: Household, id: string | null): Household {
  if (id !== null && !h.profiles.some((p) => p.id === id)) return h;
  return h.active === id ? h : { ...h, active: id };
}

export const activeProfile = (h: Household): Profile | null => h.profiles.find((p) => p.id === h.active) ?? null;

/** The profile seen as AppState: what core functions and screens work on. */
export function profileView(h: Household, p: Profile | null): AppState {
  if (!p) return { ...defaultState(), decks: h.decks };
  return { schema: 1, decks: h.decks, progress: p.progress, log: p.log, kids: p.kids, settings: { ...p.settings, line: p.kind } };
}

export const viewOf = (h: Household): AppState => profileView(h, activeProfile(h));

/** Writes a changed view back: decks to the household, the rest to the active profile. Setting line to null leaves the profile. */
export function withView(h: Household, s: AppState): Household {
  const p = activeProfile(h);
  let next: Household = s.decks === h.decks ? h : { ...h, decks: s.decks };
  if (p) {
    const changed = s.progress !== p.progress || s.log !== p.log || s.kids !== p.kids || s.settings.line !== p.kind || !sameSettings(s.settings, p.settings);
    if (changed) next = { ...next, profiles: next.profiles.map((x) => (x.id === p.id ? { ...x, progress: s.progress, log: s.log, kids: s.kids, settings: { ...s.settings, line: p.kind } } : x)) };
    if (s.settings.line === null) next = { ...next, active: null };
  }
  return next;
}

function sameSettings(a: Settings, b: Settings): boolean {
  return (Object.keys(a) as (keyof Settings)[]).every((k) => k === "line" || a[k] === b[k]);
}

const obj = <T>(v: unknown, fallback: T): T => (v && typeof v === "object" && !Array.isArray(v) ? (v as T) : fallback);

function migrateProfile(raw: Partial<Profile>, i: number): Profile | null {
  const kind: Audience | null = raw.kind === "kids" || raw.kind === "adults" ? raw.kind : null;
  const name = cleanName(typeof raw.name === "string" ? raw.name : "");
  if (!kind || !name) return null;
  const d = defaultState();
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : `p${i + 1}`,
    name,
    kind,
    avatar: typeof raw.avatar === "string" && raw.avatar ? raw.avatar : AVATARS[i % AVATARS.length],
    progress: obj(raw.progress, {}),
    log: obj(raw.log, {}),
    kids: { stars: raw.kids?.stars ?? 0, words: obj(raw.kids?.words, {}) },
    settings: { ...d.settings, ...obj(raw.settings, {}), line: kind },
  };
}

/**
 * Loads any saved state. Schema 2 is a household; schema 1 (alpha 0.1) was a single state
 * that held both lines, so it becomes an adult profile and, if a child has played, a kids profile.
 */
export function migrateHousehold(raw: unknown): Household {
  if (!raw || typeof raw !== "object") return emptyHousehold();
  const r = raw as Record<string, unknown>;
  const decks = Array.isArray(r.decks) ? (r.decks as Deck[]) : [];
  if (r.schema === 2) {
    const seen = new Set<string>();
    const profiles = (Array.isArray(r.profiles) ? r.profiles : []).flatMap((p, i) => {
      const m = migrateProfile(obj(p, {}), i);
      if (!m || seen.has(m.id)) return [];
      seen.add(m.id);
      return [m];
    });
    const active = typeof r.active === "string" && seen.has(r.active) ? r.active : null;
    return { schema: 2, decks, profiles, active };
  }
  // Schema 1.
  const v1 = raw as Partial<AppState>;
  const d = defaultState();
  const settings = { ...d.settings, ...obj(v1.settings, {}) };
  const progress = obj(v1.progress, {});
  const log = obj(v1.log, {});
  const kids = { stars: v1.kids?.stars ?? 0, words: obj(v1.kids?.words, {}) };
  const adultUsed = Object.keys(progress).length > 0 || Object.keys(log).length > 0 || settings.line === "adults";
  const kidsUsed = kids.stars > 0 || Object.keys(kids.words).length > 0 || settings.line === "kids";
  const profiles: Profile[] = [];
  if (adultUsed) profiles.push({ ...freshProfile("p1", "Ja", "adults", AVATARS[0]), progress, log, settings: { ...settings, line: "adults" } });
  if (kidsUsed) profiles.push({ ...freshProfile(`p${profiles.length + 1}`, "Dziecko", "kids", AVATARS[1]), kids, settings: { ...settings, line: "kids" } });
  const active = profiles.find((p) => p.kind === settings.line)?.id ?? null;
  return { schema: 2, decks, profiles, active };
}
