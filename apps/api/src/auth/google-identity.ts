import { BadGatewayException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { config } from '../config';
import { oauthClient } from '../google/google.client';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export const GOOGLE_IDENTITY = Symbol('GOOGLE_IDENTITY');
export interface GoogleIdentity {
  verifyIdToken(idToken: string): Promise<GoogleProfile>;
  /** Exchanges the device's serverAuthCode; refresh token is absent if Google already issued one. */
  exchangeCode(code: string): Promise<{ refreshToken?: string; scopes: string[] }>;
}

@Injectable()
export class RealGoogleIdentity implements GoogleIdentity {
  async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    try {
      const ticket = await oauthClient().verifyIdToken({ idToken, audience: config().googleClientId });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email || !p.email_verified) throw new Error('incomplete');
      return { sub: p.sub, email: p.email.toLowerCase(), name: p.name ?? p.email, picture: p.picture };
    } catch {
      throw new UnauthorizedException('Invalid Google ID token');
    }
  }

  async exchangeCode(code: string) {
    // Android serverAuthCode exchange uses an empty redirect URI.
    const client = oauthClient();
    try {
      const { tokens } = await client.getToken({ code, redirect_uri: '' });
      return { refreshToken: tokens.refresh_token ?? undefined, scopes: (tokens.scope ?? '').split(' ').filter(Boolean) };
    } catch (e) {
      throw googleCodeError(e);
    }
  }
}

/** OAuth errors that mean "this Google account may not use the app" (e.g. not a test user). */
const ACCESS_DENIED = new Set(['access_denied', 'unauthorized_client', 'org_internal', 'admin_policy_enforced']);

/**
 * Maps a failed code exchange to a client-actionable error. `code: 'google_access_denied'` lets the
 * app offer "Request access" (Testing-mode consent screens only admit listed test users).
 */
export function googleCodeError(e: unknown): Error {
  const data = (e as { response?: { data?: { error?: string } } }).response?.data;
  const reason = data?.error ?? '';
  if (ACCESS_DENIED.has(reason)) {
    return new ForbiddenException({
      statusCode: 403,
      code: 'google_access_denied',
      message: 'Google blocked access for this account. Duely is in testing — request access to be added.',
    });
  }
  return new BadGatewayException(`Google sign-in failed${reason ? ` (${reason})` : ''}. Try again.`);
}
