import { statusCodes } from '@react-native-google-signin/google-signin';
import { ApiError } from '@/lib/api';

type SignInFailure = { kind: 'cancelled' } | { kind: 'denied'; detail: string | null } | { kind: 'error'; message: string };

/**
 * Sorts sign-in failures. Google refuses accounts that aren't test users either in its own sheet
 * ("Access blocked … access_denied", surfaced by the SDK as an error code) or when the server
 * exchanges the code (our API answers 403 { code: 'google_access_denied' }). Both → Request access.
 */
export function classifySignInError(e: unknown): SignInFailure {
  if (e instanceof ApiError) {
    const body = e.body as { code?: string } | undefined;
    if (body?.code === 'google_access_denied' || e.status === 401 || e.status === 403) return { kind: 'denied', detail: null };
    return { kind: 'error', message: e.message };
  }
  const code = String((e as { code?: string | number }).code ?? '');
  const message = (e as Error)?.message ?? '';
  if (code === statusCodes.SIGN_IN_CANCELLED || code === '12501') return { kind: 'cancelled' };
  if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { kind: 'error', message: 'Update Google Play services, then try again.' };
  if (/network|fetch|timed? ?out/i.test(message) || code === '7') return { kind: 'error', message: 'No connection. Try again when you’re online.' };
  // 12500 SIGN_IN_FAILED / 10 DEVELOPER_ERROR / access_denied / unauthorized: Google refused this account.
  return { kind: 'denied', detail: code ? `Google said: ${message || 'sign-in failed'} (${code})` : message || null };
}
