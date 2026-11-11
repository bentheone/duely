import { create } from 'zustand';
import { BUILD_NUMBER, UPDATES_REPO } from './config';
import { getMetaJson, setMetaJson } from './db/repo';

/**
 * In-app update check against GitHub Releases. CI publishes each APK as a release tagged
 * `build-<run number>`; the app knows its own run number (BUILD_NUMBER) and offers newer ones.
 * Only the public releases API is called — no user data leaves the phone.
 */
export interface AvailableUpdate {
  build: number;
  name: string;
  notes: string;
  apkUrl: string;
  pageUrl: string;
  publishedAt: string;
}

const CHECK_EVERY = 6 * 3600_000;

interface UpdateState {
  available: AvailableUpdate | null;
  checking: boolean;
  checkedAt: number | null;
  error: string | null;
  dismissedBuild: number;
}

export const useUpdates = create<UpdateState>(() => ({
  available: null,
  checking: false,
  checkedAt: null,
  error: null,
  dismissedBuild: 0,
}));

/** Parses a GitHub release into an update if it is newer than this build. Pure (tested). */
export function parseRelease(r: unknown, current: number): AvailableUpdate | null {
  const rel = r as { tag_name?: string; name?: string; body?: string; html_url?: string; published_at?: string; draft?: boolean; assets?: { name: string; browser_download_url: string }[] };
  const m = /^build-(\d+)$/.exec(rel?.tag_name ?? '');
  if (!m || rel.draft) return null;
  const build = Number(m[1]);
  const apk = rel.assets?.find((a) => a.name.endsWith('.apk'));
  if (!apk || build <= current) return null;
  return {
    build,
    name: rel.name || `Build ${build}`,
    notes: (rel.body ?? '').slice(0, 600),
    apkUrl: apk.browser_download_url,
    pageUrl: rel.html_url ?? `https://github.com/${UPDATES_REPO}/releases`,
    publishedAt: rel.published_at ?? '',
  };
}

export async function checkForUpdate(opts: { force?: boolean } = {}): Promise<AvailableUpdate | null> {
  const cached = getMetaJson<{ at: number; update: AvailableUpdate | null; dismissed?: number } | null>('updateCheck', null);
  useUpdates.setState({ dismissedBuild: cached?.dismissed ?? 0 });
  if (!opts.force && cached && Date.now() - cached.at < CHECK_EVERY) {
    const still = cached.update && cached.update.build > BUILD_NUMBER ? cached.update : null;
    useUpdates.setState({ available: still, checkedAt: cached.at });
    return still;
  }
  useUpdates.setState({ checking: true, error: null });
  try {
    const res = await fetch(`https://api.github.com/repos/${UPDATES_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'duely-app' },
    });
    if (res.status === 404) {
      // No releases yet.
      setMetaJson('updateCheck', { at: Date.now(), update: null, dismissed: cached?.dismissed });
      useUpdates.setState({ available: null, checkedAt: Date.now() });
      return null;
    }
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const update = parseRelease(await res.json(), BUILD_NUMBER);
    setMetaJson('updateCheck', { at: Date.now(), update, dismissed: cached?.dismissed });
    useUpdates.setState({ available: update, checkedAt: Date.now() });
    return update;
  } catch (e) {
    useUpdates.setState({ error: (e as Error).message });
    return null;
  } finally {
    useUpdates.setState({ checking: false });
  }
}

/** "Later": don't prompt again for this build (Settings still shows it). */
export function dismissUpdate(build: number) {
  const cached = getMetaJson<Record<string, unknown> | null>('updateCheck', null);
  setMetaJson('updateCheck', { ...(cached ?? { at: 0, update: null }), dismissed: build });
  useUpdates.setState({ dismissedBuild: build });
}
