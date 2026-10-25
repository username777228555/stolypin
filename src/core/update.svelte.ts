/**
 * «Вышла новая версия»: twice a day — at app start and when the user comes back to it (APK only, when online and
 * allowed in settings) — asks GitHub for the app's releases and remembers the newest `vX.Y.Z` above the running version. HomePage shows a banner with a
 * link to the APK; Android itself asks to confirm the install. Nothing is sent except this one request
 * (with the device's GitHub token, if the repository is private).
 *
 *   initUpdateChecks();         // App.svelte, after boot: now and on every return to the app, at most every 12 hours
 *   update.available            // { version, url } | null — what the banner shows
 *   dismissUpdate()             // «Позже»: hide this version until a newer one comes out
 */
import { kvGet, kvSet } from './db';
import { isNative } from './platform';
import { settings } from './settings.svelte';
import { APP_REPO, loadSource } from '$lib/modules/library/github';

export interface AppUpdate {
  version: string;
  /** APK of the release (public repository) or the release page (private one: the browser asks to sign in). */
  url: string;
}

const STATE_KEY = 'update-check';
/** Android keeps the app in memory for days, so the check also runs on return from the background. */
const INTERVAL = 12 * 60 * 60 * 1000;
interface Saved {
  at: number;
  found: AppUpdate | null;
  dismissed?: string;
}

export const update = $state<{ available: AppUpdate | null }>({ available: null });

/** -1 / 0 / 1 for «0.5.1» vs «0.6.0». */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

const show = (s: Saved) => {
  const f = s.found;
  update.available = f && f.version !== s.dismissed && compareVersions(f.version, __APP_VERSION__) > 0 ? f : null;
};

export async function checkForUpdate(): Promise<void> {
  if (!isNative || !settings.checkUpdates) return;
  const saved = await kvGet<Saved>(STATE_KEY, { at: 0, found: null });
  show(saved);
  if (Date.now() - saved.at < INTERVAL || !navigator.onLine) return;
  try {
    const { token } = await loadSource();
    const r = await fetch(`https://api.github.com/repos/${APP_REPO}/releases?per_page=20`, {
      headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!r.ok) return;
    type Rel = { tag_name: string; draft: boolean; prerelease: boolean; html_url: string; assets: { name: string; browser_download_url: string }[] };
    // Only version releases: the repository also has «books» and «import» releases.
    const releases = ((await r.json()) as Rel[]).filter((x) => !x.draft && !x.prerelease && /^v\d+\.\d+\.\d+$/.test(x.tag_name));
    const newest = releases.sort((a, b) => compareVersions(b.tag_name.slice(1), a.tag_name.slice(1)))[0];
    const apk = newest?.assets.find((a) => a.name.endsWith('.apk'));
    const found = newest ? { version: newest.tag_name.slice(1), url: apk && !token ? apk.browser_download_url : newest.html_url } : null;
    const next = { ...saved, at: Date.now(), found };
    await kvSet(STATE_KEY, next);
    show(next);
  } catch {
    /* offline or GitHub is unreachable: try on the next start or return */
  }
}

export function initUpdateChecks(): void {
  void checkForUpdate();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void checkForUpdate();
  });
}

export async function dismissUpdate(): Promise<void> {
  const saved = await kvGet<Saved>(STATE_KEY, { at: 0, found: null });
  const next = { ...saved, dismissed: update.available?.version };
  await kvSet(STATE_KEY, next);
  update.available = null;
}
