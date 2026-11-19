// Self-update: picks the newest GitHub release that is newer than the running version.
// Pure logic; fetching and installing live in platform/update.ts.

/** The subset of a GitHub release (REST API) that Echo reads. */
export type Release = {
  tag_name?: unknown;
  draft?: unknown;
  html_url?: unknown;
  assets?: unknown;
};

export type Update = {
  version: string;
  /** Direct download URL of the APK. */
  url: string;
  name: string;
  size: number;
  /** Release page on GitHub. */
  page: string;
};

type Version = { core: [number, number, number]; pre: string[] };

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(v: string): Version | null {
  const m = SEMVER.exec(v.trim());
  if (!m) return null;
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split(".") : [] };
}

/** SemVer precedence: negative when a < b, 0 when equal, positive when a > b. Unparsable versions sort first. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0);
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  // A version without a pre-release part ranks above any pre-release of it (1.0.0 > 1.0.0-alpha.9).
  if (!x.pre.length || !y.pre.length) return (x.pre.length ? 0 : 1) - (y.pre.length ? 0 : 1);
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i], q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
    if (pn && qn) {
      if (Number(p) !== Number(q)) return Number(p) - Number(q);
    } else if (pn !== qn) return pn ? -1 : 1;
    else if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

/** Only APKs published by this repository's release workflow are downloaded. */
export const RELEASES_API = "https://api.github.com/repos/jakubprill/echo/releases?per_page=20";
export const DOWNLOAD_PREFIX = "https://github.com/jakubprill/echo/releases/download/";
export const ANDROID_ASSET = /-android-arm64\.apk$/;

/**
 * The newest release (pre-releases included, drafts skipped) that is newer than `current`
 * and carries an asset matching `asset`, or null when Echo is up to date.
 */
export function newestUpdate(releases: unknown, current: string, asset: RegExp = ANDROID_ASSET): Update | null {
  if (!Array.isArray(releases) || !parseVersion(current)) return null;
  let best: Update | null = null;
  for (const r of releases as Release[]) {
    if (!r || r.draft === true || typeof r.tag_name !== "string") continue;
    const version = r.tag_name.replace(/^v/, "");
    if (!parseVersion(version) || compareVersions(version, current) <= 0) continue;
    if (best && compareVersions(version, best.version) <= 0) continue;
    const files = Array.isArray(r.assets) ? (r.assets as Record<string, unknown>[]) : [];
    const file = files.find((a) => typeof a?.name === "string" && asset.test(a.name) && typeof a.browser_download_url === "string" && a.browser_download_url.startsWith(DOWNLOAD_PREFIX));
    if (!file) continue;
    best = {
      version,
      url: file.browser_download_url as string,
      name: file.name as string,
      size: typeof file.size === "number" ? file.size : 0,
      page: typeof r.html_url === "string" ? r.html_url : `https://github.com/jakubprill/echo/releases/tag/${r.tag_name}`,
    };
  }
  return best;
}
