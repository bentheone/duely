import { Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthGoogleSchema, DEFAULT_SETTINGS, DEFAULT_TIMEZONE, RefreshSchema, uuidv7, type AuthTokens } from '@duely/shared';
import { CurrentUser, Public, ZodPipe, type AuthedUser } from '../common/http';
import { encrypt } from '../common/crypto';
import { ApiTokenModel, IntegrationAccountModel, UserModel } from '../db/models';
import { TokensService } from './tokens.service';
import { GOOGLE_IDENTITY, type GoogleIdentity } from './google-identity';
import { toPublicUser } from '../me/me.controller';

type GoogleBody = z.infer<typeof AuthGoogleSchema>;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly tokens: TokensService,
    @Inject(GOOGLE_IDENTITY) private readonly google: GoogleIdentity,
  ) {}

  /** §7.1: verify ID token, exchange code, store refresh token encrypted, issue Duely tokens. */
  @Public()
  @Post('google')
  @HttpCode(200)
  async google_(@Body(new ZodPipe(AuthGoogleSchema)) body: GoogleBody) {
    const profile = await this.google.verifyIdToken(body.idToken);
    const now = Date.now();
    let user = await UserModel.findOne({ googleSub: profile.sub }).lean();
    if (!user) {
      const created = await UserModel.create({
        _id: uuidv7(),
        googleSub: profile.sub,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.picture ?? null,
        timezone: body.timezone ?? DEFAULT_TIMEZONE,
        settings: structuredClone(DEFAULT_SETTINGS),
        createdAt: now,
        updatedAt: now,
      });
      user = created.toObject();
    } else {
      await UserModel.updateOne(
        { _id: user._id },
        { $set: { email: profile.email, name: profile.name, avatarUrl: profile.picture ?? null, updatedAt: now } },
      );
    }

    const acc = await IntegrationAccountModel.findOne({ userId: user._id }).lean();
    const set: Record<string, unknown> = {};
    if (body.serverAuthCode) {
      const ex = await this.google.exchangeCode(body.serverAuthCode);
      if (ex.refreshToken) set.refreshTokenEnc = encrypt(ex.refreshToken);
      if (ex.scopes.length) set.scopes = [...new Set([...(acc?.scopes ?? []), ...ex.scopes])];
    }
    if (!acc) {
      await IntegrationAccountModel.create({ _id: uuidv7(), userId: user._id, provider: 'google', ...set });
    } else if (Object.keys(set).length) {
      await IntegrationAccountModel.updateOne({ _id: acc._id }, { $set: set });
    }

    const tokens: AuthTokens = await this.tokens.issue(user._id);
    const fresh = await UserModel.findById(user._id).lean();
    const integ = await IntegrationAccountModel.findOne({ userId: user._id }).lean();
    return {
      ...tokens,
      user: toPublicUser(fresh!),
      google: {
        connected: !!integ?.refreshTokenEnc,
        scopes: integ?.scopes ?? [],
        calendarsConfigured: !!integ?.calendarsConfigured,
      },
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodPipe(RefreshSchema)) body: { refreshToken: string }) {
    return this.tokens.rotate(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodPipe(RefreshSchema)) body: { refreshToken: string }) {
    await this.tokens.revoke(body.refreshToken).catch(() => undefined);
  }

  // ---- v2: personal API tokens for non-interactive clients (Mac helper) ----

  @Post('tokens')
  createToken(@CurrentUser() u: AuthedUser, @Body(new ZodPipe(z.object({ name: z.string().min(1).max(60) }))) b: { name: string }) {
    return this.tokens.createPat(u.userId, b.name);
  }

  @Get('tokens')
  async listTokens(@CurrentUser() u: AuthedUser) {
    const rows = await ApiTokenModel.find({ userId: u.userId, revokedAt: null }).sort({ createdAt: -1 }).lean();
    return rows.map((r) => ({ id: r._id, name: r.name, prefix: r.prefix, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt }));
  }

  @Delete('tokens/:id')
  @HttpCode(204)
  async deleteToken(@CurrentUser() u: AuthedUser, @Param('id') id: string) {
    const r = await ApiTokenModel.updateOne({ _id: id, userId: u.userId, revokedAt: null }, { $set: { revokedAt: Date.now() } });
    if (r.matchedCount === 0) throw new NotFoundException();
  }
}
