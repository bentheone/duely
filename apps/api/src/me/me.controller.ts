import { config } from '../config';
import { Body, ConflictException, Controller, Get, NotFoundException, Patch } from '@nestjs/common';
import { ProfilePatchSchema, SettingsPatchSchema, SettingsSchema, type SettingsPatch, type User } from '@duely/shared';
import type { z } from 'zod';
import { DEFAULT_SETTINGS } from '@duely/shared';
import { CurrentUser, ZodPipe, type AuthedUser } from '../common/http';
import { IntegrationAccountModel, UserModel, type UserDoc } from '../db/models';

export function isAdminEmail(email: string): boolean {
  return config().adminEmails.includes(email.toLowerCase());
}

export function toPublicUser(u: UserDoc): User {
  return {
    id: u._id,
    googleSub: u.googleSub,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl ?? null,
    timezone: u.timezone,
    settings: u.settings,
    activeSemesterId: u.activeSemesterId ?? null,
    isAdmin: isAdminEmail(u.email),
    username: u.username ?? null,
  };
}

@Controller('me')
export class MeController {
  @Get()
  async me(@CurrentUser() u: AuthedUser) {
    const user = await UserModel.findById(u.userId).lean();
    if (!user) throw new NotFoundException();
    const integ = await IntegrationAccountModel.findOne({ userId: u.userId }).lean();
    return {
      user: toPublicUser(user),
      google: {
        connected: !!integ?.refreshTokenEnc,
        scopes: integ?.scopes ?? [],
        calendarsConfigured: !!integ?.calendarsConfigured,
        lastSyncAt: integ?.lastSyncAt ?? null,
      },
    };
  }

  /** Username (unique, lowercase); null clears it. */
  @Patch('profile')
  async patchProfile(@CurrentUser() u: AuthedUser, @Body(new ZodPipe(ProfilePatchSchema)) b: z.infer<typeof ProfilePatchSchema>) {
    if (b.username) {
      const taken = await UserModel.exists({ username: b.username, _id: { $ne: u.userId } });
      if (taken) throw new ConflictException('That username is taken');
    }
    try {
      await UserModel.updateOne({ _id: u.userId }, b.username ? { $set: { username: b.username, updatedAt: Date.now() } } : { $unset: { username: 1 }, $set: { updatedAt: Date.now() } });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw new ConflictException('That username is taken');
      throw e;
    }
    const user = await UserModel.findById(u.userId).lean();
    if (!user) throw new NotFoundException();
    return toPublicUser(user);
  }

  @Patch('settings')
  async patchSettings(@CurrentUser() u: AuthedUser, @Body(new ZodPipe(SettingsPatchSchema)) patch: SettingsPatch) {
    const user = await UserModel.findById(u.userId).lean();
    if (!user) throw new NotFoundException();
    const s = structuredClone(user.settings);
    const { activeSemesterId, timezone, ...rest } = patch;
    for (const [k, v] of Object.entries(rest)) {
      const key = k as keyof typeof s;
      if (v && typeof v === 'object' && !Array.isArray(v))
        (s as Record<string, unknown>)[key] = { ...((s[key] as object | undefined) ?? (DEFAULT_SETTINGS[key] as object)), ...v };
      else (s as Record<string, unknown>)[key] = v;
    }
    const settings = SettingsSchema.parse(s);
    const set: Record<string, unknown> = { settings, updatedAt: Date.now() };
    if (activeSemesterId !== undefined) set.activeSemesterId = activeSemesterId;
    if (timezone) set.timezone = timezone;
    await UserModel.updateOne({ _id: u.userId }, { $set: set });
    return toPublicUser((await UserModel.findById(u.userId).lean())!);
  }
}
