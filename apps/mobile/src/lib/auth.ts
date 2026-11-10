import { GoogleSignin } from '@react-native-google-signin/google-signin';
import type { AuthTokens, User } from '@duely/shared';
import { api, getTokens, setTokens } from './api';
import { DRIVE_SCOPE, GOOGLE_SCOPES, GOOGLE_WEB_CLIENT_ID } from './config';
import { resetLocalData } from './db/client';
import { useApp } from './store';
import { syncNow } from './sync/engine';

let configured = false;
function configure(extraScopes: string[] = []) {
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: true,
    forceCodeForRefreshToken: true,
    scopes: [...GOOGLE_SCOPES, ...extraScopes],
  });
  configured = true;
}

interface AuthResponse extends AuthTokens {
  user: User;
  google: { connected: boolean; scopes: string[]; calendarsConfigured: boolean };
}

/** §7.1: Google sign-in → POST /auth/google with serverAuthCode + idToken. */
export async function signInWithGoogle(): Promise<AuthResponse | null> {
  if (!configured) configure();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  if (res.type !== 'success' || !res.data.idToken) return null;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const auth = await api<AuthResponse>('/auth/google', {
    auth: false,
    body: { idToken: res.data.idToken, serverAuthCode: res.data.serverAuthCode ?? undefined, timezone },
  });
  await setTokens({ accessToken: auth.accessToken, refreshToken: auth.refreshToken, accessExpiresAt: auth.accessExpiresAt });
  const st = useApp.getState();
  st.setUser(auth.user, { connected: auth.google.connected, scopes: auth.google.scopes });
  st.set({ signedIn: true });
  return auth;
}

/** Incremental consent for Drive storage (only when the user picks Drive). */
export async function grantDriveScope(): Promise<boolean> {
  if (!configured) configure();
  let code: string | null = null;
  try {
    const r = await GoogleSignin.addScopes({ scopes: [DRIVE_SCOPE] });
    code = r && r.type === 'success' ? r.data.serverAuthCode : null;
  } catch {
    code = null;
  }
  if (!code) {
    // Some devices don't return a fresh code from addScopes — re-run sign-in with the extra scope.
    configure([DRIVE_SCOPE]);
    const r = await GoogleSignin.signIn();
    code = r.type === 'success' ? r.data.serverAuthCode : null;
  }
  if (!code) return false;
  const out = await api<{ scopes: string[] }>('/integrations/google/code', { body: { serverAuthCode: code } });
  const st = useApp.getState();
  if (st.user) st.setUser(st.user, { connected: true, scopes: out.scopes });
  return out.scopes.includes(DRIVE_SCOPE);
}

export async function refreshMe(): Promise<void> {
  const me = await api<{ user: User; google: { connected: boolean; scopes: string[] } }>('/me');
  useApp.getState().setUser(me.user, me.google);
}

export async function signOut(): Promise<void> {
  const t = await getTokens();
  try {
    await syncNow();
  } catch {
    // ignore
  }
  if (t) await api('/auth/logout', { auth: false, body: { refreshToken: t.refreshToken } }).catch(() => undefined);
  try {
    if (!configured) configure();
    await GoogleSignin.signOut();
  } catch {
    // ignore
  }
  await setTokens(null);
  resetLocalData();
  useApp.setState({ signedIn: false, onboarded: false, user: null, googleConnected: false, scopes: [] });
}
