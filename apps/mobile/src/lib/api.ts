import * as SecureStore from 'expo-secure-store';
import type { AuthTokens } from '@duely/shared';
import { API_URL } from './config';

const KEY = 'duely.tokens';
let cached: AuthTokens | null | undefined;
let refreshing: Promise<AuthTokens | null> | null = null;
let onSignedOut: (() => void) | null = null;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

export function setSignedOutHandler(fn: () => void) {
  onSignedOut = fn;
}

export async function getTokens(): Promise<AuthTokens | null> {
  if (cached !== undefined) return cached;
  const raw = await SecureStore.getItemAsync(KEY);
  cached = raw ? (JSON.parse(raw) as AuthTokens) : null;
  return cached;
}

export async function setTokens(t: AuthTokens | null): Promise<void> {
  cached = t;
  if (t) await SecureStore.setItemAsync(KEY, JSON.stringify(t));
  else await SecureStore.deleteItemAsync(KEY);
}

async function refresh(): Promise<AuthTokens | null> {
  const t = await getTokens();
  if (!t) return null;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: t.refreshToken }),
  });
  if (res.status === 401) {
    await setTokens(null);
    onSignedOut?.();
    return null;
  }
  if (!res.ok) throw new ApiError(res.status, 'Refresh failed');
  const next = (await res.json()) as AuthTokens;
  await setTokens(next);
  return next;
}

/** Single-flight refresh so parallel 401s rotate the refresh token only once. */
function refreshOnce() {
  if (!refreshing) refreshing = refresh().finally(() => (refreshing = null));
  return refreshing;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const doFetch = async (token?: string) =>
    fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

  let token: string | undefined;
  if (init.auth !== false) {
    let t = await getTokens();
    if (t && t.accessExpiresAt - Date.now() < 30_000) t = await refreshOnce();
    if (!t) throw new ApiError(401, 'Signed out');
    token = t.accessToken;
  }
  let res = await doFetch(token);
  if (res.status === 401 && init.auth !== false) {
    const t = await refreshOnce();
    if (!t) throw new ApiError(401, 'Signed out');
    res = await doFetch(t.accessToken);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const msg = (body as { message?: string } | undefined)?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : String(msg), body);
  }
  return body as T;
}
