import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import type { GoogleSyncSummary, PullResponse, PushResponse, SyncTable, User } from '@duely/shared';
import { api, ApiError, getTokens } from '../api';
import { getRawDb } from '../db/client';
import { applyRemote, emitChange, getMeta, onDataChange, setMeta, setMetaJson } from '../db/repo';
import { useApp } from '../store';

const PUSH_BATCH = 200;
const GOOGLE_MIN_INTERVAL = 5 * 60 * 1000;

let running: Promise<void> | null = null;
let again = false;
let debounce: ReturnType<typeof setTimeout> | null = null;

interface OutboxRow {
  id: number;
  table: string;
  recordId: string;
  payload: string;
  createdAt: number;
  attempts: number;
}

export function pendingCount(): number {
  return getRawDb().getFirstSync<{ n: number }>('SELECT COUNT(*) as n FROM outbox')?.n ?? 0;
}

async function push(): Promise<void> {
  const db = getRawDb();
  for (;;) {
    const rows = db.getAllSync<OutboxRow>(
      'SELECT id, "table", recordId, payload, createdAt, attempts FROM outbox WHERE attempts < 8 ORDER BY id LIMIT ?',
      PUSH_BATCH,
    );
    if (rows.length === 0) return;
    const res = await api<PushResponse>('/sync/push', {
      body: { changes: rows.map((r) => ({ table: r.table, record: JSON.parse(r.payload) })) },
    });
    const accepted = new Set(res.accepted);
    const rejected = new Map(res.rejected.map((r) => [r.id, r.reason]));
    db.withTransactionSync(() => {
      for (const r of rows) {
        if (accepted.has(r.recordId)) {
          // Only clear if not edited again while the request was in flight.
          db.runSync('DELETE FROM outbox WHERE id = ? AND createdAt = ?', r.id, r.createdAt);
        } else if (rejected.has(r.recordId)) {
          db.runSync('UPDATE outbox SET attempts = attempts + 1 WHERE id = ?', r.id);
          console.warn(`sync: ${r.table}/${r.recordId} rejected: ${rejected.get(r.recordId)}`);
        }
      }
      for (const c of res.conflicts) {
        // Server copy is newer → it wins locally (§6).
        db.runSync('DELETE FROM outbox WHERE "table" = ? AND recordId = ?', c.table, c.record.id);
        applyRemote(c.table, c.record as never);
      }
    });
    if (res.conflicts.length) emitChange('remote');
    if (rows.length < PUSH_BATCH) return;
  }
}

async function pull(): Promise<boolean> {
  let since = Number(getMeta('lastPulledRev') ?? 0);
  let changed = false;
  for (;;) {
    const res = await api<PullResponse>(`/sync/pull?since=${since}`);
    if (res.changes.length) {
      getRawDb().withTransactionSync(() => {
        for (const ch of res.changes) applyRemote(ch.table as SyncTable, ch.record as never);
      });
      changed = true;
    }
    since = res.maxRev;
    setMeta('lastPulledRev', String(since));
    if (!res.hasMore) break;
  }
  if (changed) emitChange('remote');
  return changed;
}

async function pushSettings(): Promise<void> {
  if (getMeta('settingsDirty') !== '1') return;
  const u = useApp.getState().user;
  if (!u) return;
  const fresh = await api<User>('/me/settings', {
    method: 'PATCH',
    body: { ...u.settings, activeSemesterId: u.activeSemesterId ?? null },
  });
  setMeta('settingsDirty', null);
  useApp.getState().setUser(fresh);
}

async function googleSync(force: boolean): Promise<void> {
  const last = Number(getMeta('lastGoogleSyncAt') ?? 0);
  if (!force && Date.now() - last < GOOGLE_MIN_INTERVAL) return;
  if (!useApp.getState().googleConnected) return;
  const summary = await api<GoogleSyncSummary>('/integrations/google/sync', { body: { force } });
  if (summary.skipped) return;
  setMeta('lastGoogleSyncAt', String(Date.now()));
  setMetaJson('unmatchedEvents', summary.unmatchedEvents);
  // Server-side Google writes bump revs → pull them.
  await pull();
}

/** One full cycle: push → pull → settings → (debounced) Google sync. Concurrent calls coalesce. */
export function syncNow(opts: { forceGoogle?: boolean } = {}): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    if (!(await getTokens())) return;
    const st = useApp.getState();
    st.set({ syncing: true });
    try {
      await push();
      await pull();
      await pushSettings();
      await googleSync(!!opts.forceGoogle);
      const now = Date.now();
      setMeta('lastSyncedAt', String(now));
      st.set({ lastSyncedAt: now, syncError: null, online: true });
    } catch (e) {
      const offline = !(e instanceof ApiError);
      st.set({ syncError: offline ? 'offline' : (e as Error).message, online: !offline });
    } finally {
      st.set({ syncing: false });
    }
  })().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

/** After any local write: debounced 2 s (§6). */
export function scheduleSync(delay = 2000) {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    void syncNow();
  }, delay);
}

let started = false;
/** Triggers: app start, foreground, connectivity regained, after writes (§6). */
export function startSyncTriggers(): () => void {
  if (started) return () => undefined;
  started = true;
  void syncNow();
  const offData = onDataChange((src) => src === 'local' && scheduleSync());
  const appSub = AppState.addEventListener('change', (s) => s === 'active' && void syncNow());
  let wasOnline = true;
  const offNet = NetInfo.addEventListener((s) => {
    const online = !!s.isConnected && s.isInternetReachable !== false;
    useApp.getState().set({ online });
    if (online && !wasOnline) void syncNow();
    wasOnline = online;
  });
  return () => {
    started = false;
    offData();
    appSub.remove();
    offNet();
  };
}
