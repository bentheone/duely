import { useMemo } from 'react';
import { create } from 'zustand';
import { DEFAULT_SETTINGS, DEFAULT_TIMEZONE, type User, type UserSettings } from '@duely/shared';
import { getMetaJson, setMetaJson, getMeta, setMeta } from './db/repo';

export type UploadState = { status: 'queued' | 'uploading' | 'error' | 'done'; progress?: number; error?: string };

interface AppState {
  ready: boolean;
  signedIn: boolean;
  onboarded: boolean;
  user: User | null;
  googleConnected: boolean;
  scopes: string[];
  online: boolean;
  syncing: boolean;
  lastSyncedAt: number | null;
  syncError: string | null;
  uploads: Record<string, UploadState>;
  /** Semester the user picked or created on purpose (kept even while it has no courses). */
  explicitSemesterId: string | null;
  hydrate(signedIn: boolean): void;
  setUser(u: User, google?: { connected: boolean; scopes: string[] }): void;
  updateSettings(patch: Partial<UserSettings>): void;
  setActiveSemester(id: string | null, explicit?: boolean): void;
  setOnboarded(v: boolean): void;
  setUpload(id: string, s: UploadState | null): void;
  set(p: Partial<Pick<AppState, 'online' | 'syncing' | 'lastSyncedAt' | 'syncError' | 'signedIn'>>): void;
}

function deepMerge<T>(base: T, patch: Partial<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const b = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' ? { ...(b as object), ...(v as object) } : v;
  }
  return out as T;
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  signedIn: false,
  onboarded: false,
  user: null,
  googleConnected: false,
  scopes: [],
  online: true,
  syncing: false,
  lastSyncedAt: null,
  syncError: null,
  uploads: {},
  explicitSemesterId: null,
  hydrate(signedIn) {
    const user = getMetaJson<User | null>('user', null);
    const g = getMetaJson<{ connected: boolean; scopes: string[] }>('google', { connected: false, scopes: [] });
    set({
      ready: true,
      signedIn,
      user,
      googleConnected: g.connected,
      scopes: g.scopes,
      onboarded: getMeta('onboarded') === '1',
      explicitSemesterId: getMeta('explicitSemesterId'),
      lastSyncedAt: Number(getMeta('lastSyncedAt')) || null,
    });
  },
  setUser(u, google) {
    // Keep locally edited (not yet pushed) settings.
    const dirty = getMeta('settingsDirty') === '1';
    const current = get().user;
    const user = dirty && current ? { ...u, settings: current.settings, activeSemesterId: current.activeSemesterId } : u;
    setMetaJson('user', user);
    setMeta('userId', u.id);
    if (google) setMetaJson('google', google);
    set({ user, ...(google ? { googleConnected: google.connected, scopes: google.scopes } : {}) });
  },
  updateSettings(patch) {
    const u = get().user;
    if (!u) return;
    const user = { ...u, settings: deepMerge(u.settings, patch) };
    setMetaJson('user', user);
    setMeta('settingsDirty', '1');
    set({ user });
  },
  setActiveSemester(id, explicit) {
    const u = get().user;
    if (!u) return;
    const user = { ...u, activeSemesterId: id };
    setMetaJson('user', user);
    setMeta('settingsDirty', '1');
    if (explicit) setMeta('explicitSemesterId', id);
    set({ user, ...(explicit ? { explicitSemesterId: id } : {}) });
  },
  setOnboarded(v) {
    setMeta('onboarded', v ? '1' : null);
    set({ onboarded: v });
  },
  setUpload(id, s) {
    const uploads = { ...get().uploads };
    if (s) uploads[id] = s;
    else delete uploads[id];
    set({ uploads });
  },
  set(p) {
    set(p);
  },
}));

const withDefaults = (s: Partial<UserSettings> | undefined): UserSettings => (s ? { ...DEFAULT_SETTINGS, ...s, lectures: s.lectures ?? DEFAULT_SETTINGS.lectures } : DEFAULT_SETTINGS);

export function useSettings(): UserSettings {
  const s = useApp((st) => st.user?.settings);
  return useMemo(() => withDefaults(s), [s]);
}
export function useTz(): string {
  return useApp((s) => s.user?.timezone) ?? DEFAULT_TIMEZONE;
}
export function currentSettings(): UserSettings {
  return withDefaults(useApp.getState().user?.settings);
}
export function currentTz(): string {
  return useApp.getState().user?.timezone ?? DEFAULT_TIMEZONE;
}
