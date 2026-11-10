import { Injectable, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { uuidv7, type AuthTokens } from '@duely/shared';
import { config } from '../config';
import { ApiTokenModel, RefreshTokenModel } from '../db/models';
import { randomToken, sha256 } from '../common/crypto';

export const ACCESS_TTL_S = 15 * 60;
export const REFRESH_TTL_S = 30 * 24 * 3600;

interface RefreshClaims {
  sub: string;
  jti: string;
  fam: string;
  typ: 'refresh';
}

/** Duely JWT access (15 min) + rotating refresh (30 days) with reuse detection (§7.1). */
@Injectable()
export class TokensService {
  signAccess(userId: string): { token: string; expiresAt: number } {
    const token = jwt.sign({ sub: userId, typ: 'access' }, config().jwtSecret, {
      expiresIn: ACCESS_TTL_S,
      algorithm: 'HS256',
    });
    return { token, expiresAt: Date.now() + ACCESS_TTL_S * 1000 };
  }

  verifyAccess(token: string): string {
    try {
      const p = jwt.verify(token, config().jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      if (p.typ !== 'access' || typeof p.sub !== 'string') throw new Error('bad type');
      return p.sub;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  async issue(userId: string, family = uuidv7()): Promise<AuthTokens> {
    const jti = uuidv7();
    const refreshToken = jwt.sign({ sub: userId, jti, fam: family, typ: 'refresh' }, config().jwtRefreshSecret, {
      expiresIn: REFRESH_TTL_S,
      algorithm: 'HS256',
    });
    await RefreshTokenModel.create({
      _id: jti,
      userId,
      family,
      expiresAt: new Date(Date.now() + REFRESH_TTL_S * 1000),
    });
    const access = this.signAccess(userId);
    return { accessToken: access.token, accessExpiresAt: access.expiresAt, refreshToken };
  }

  private decodeRefresh(token: string): RefreshClaims {
    try {
      const p = jwt.verify(token, config().jwtRefreshSecret, { algorithms: ['HS256'] }) as unknown as RefreshClaims;
      if (p.typ !== 'refresh') throw new Error('bad type');
      return p;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async rotate(token: string): Promise<AuthTokens> {
    const claims = this.decodeRefresh(token);
    // Atomically mark as used; if it was already used/revoked → reuse → kill the family.
    const row = await RefreshTokenModel.findOneAndUpdate(
      { _id: claims.jti, userId: claims.sub, usedAt: null, revokedAt: null },
      { $set: { usedAt: Date.now() } },
    ).lean();
    if (!row) {
      await this.revokeFamily(claims.fam);
      throw new UnauthorizedException('Refresh token reused or revoked');
    }
    return this.issue(claims.sub, claims.fam);
  }

  async revoke(token: string): Promise<void> {
    const claims = this.decodeRefresh(token);
    await this.revokeFamily(claims.fam);
  }

  async revokeFamily(family: string): Promise<void> {
    await RefreshTokenModel.updateMany({ family, revokedAt: null }, { $set: { revokedAt: Date.now() } });
  }

  // ---- Personal API tokens (v2 Mac helper) ----

  async createPat(userId: string, name: string): Promise<{ id: string; token: string; name: string }> {
    const token = `duely_pat_${randomToken(32)}`;
    const id = uuidv7();
    await ApiTokenModel.create({
      _id: id,
      userId,
      name,
      hash: sha256(token),
      prefix: token.slice(0, 14),
      createdAt: Date.now(),
    });
    return { id, token, name };
  }

  async verifyPat(token: string): Promise<string> {
    const row = await ApiTokenModel.findOneAndUpdate(
      { hash: sha256(token), revokedAt: null },
      { $set: { lastUsedAt: Date.now() } },
    ).lean();
    if (!row) throw new UnauthorizedException('Invalid API token');
    return row.userId;
  }
}
