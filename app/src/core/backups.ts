// Automatic daily backups: one file per day, the newest few are kept.
export const KEEP_BACKUPS = 5;
const NAME = /^echo-(\d{4}-\d{2}-\d{2})\.json$/;

export const backupName = (day: string): string => `echo-${day}.json`;
export const backupDay = (name: string): string | null => NAME.exec(name)?.[1] ?? null;

/** Local calendar day as YYYY-MM-DD. */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** What to do today: write today's file unless it exists, then remove all but the newest `keep`. Unknown files are left alone. */
export function backupPlan(existing: string[], today: string, keep = KEEP_BACKUPS): { write: string | null; remove: string[] } {
  const ours = existing.filter((n) => backupDay(n) !== null);
  const write = ours.includes(backupName(today)) ? null : backupName(today);
  const all = [...ours, ...(write ? [write] : [])].sort().reverse();
  return { write, remove: all.slice(keep) };
}
