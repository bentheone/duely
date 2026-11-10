import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { CalendarsPutSchema, type CalendarListItem } from '@duely/shared';
import { CurrentUser, ZodPipe, type AuthedUser } from '../common/http';
import { encrypt } from '../common/crypto';
import { IntegrationAccountModel } from '../db/models';
import { GOOGLE_IDENTITY, type GoogleIdentity } from '../auth/google-identity';
import { GoogleSyncService, DUELY_CALENDAR_NAME } from './google-sync.service';

const SyncBody = z.object({ force: z.boolean().optional() }).default({});
const CodeBody = z.object({ serverAuthCode: z.string().min(4) });

@Controller('integrations/google')
export class IntegrationsController {
  constructor(
    private readonly google: GoogleSyncService,
    @Inject(GOOGLE_IDENTITY) private readonly identity: GoogleIdentity,
  ) {}

  private async acc(userId: string) {
    const acc = await this.google.account(userId);
    if (!acc?.refreshTokenEnc) throw new BadRequestException('Google account not connected');
    return acc;
  }

  @Get('calendars')
  async calendars(@CurrentUser() u: AuthedUser): Promise<CalendarListItem[]> {
    const acc = await this.acc(u.userId);
    const list = await this.google.api(acc).listCalendars();
    const busyDefault = acc.calendarsConfigured ? acc.busyCalendarIds : list.filter((c) => c.primary).map((c) => c.id);
    return list
      .filter((c) => c.id !== acc.duelyCalendarId && c.summary !== DUELY_CALENDAR_NAME)
      .map((c) => ({
        ...c,
        timetable: acc.timetableCalendarIds.includes(c.id),
        busy: busyDefault.includes(c.id),
      }));
  }

  @Put('calendars')
  async putCalendars(
    @CurrentUser() u: AuthedUser,
    @Body(new ZodPipe(CalendarsPutSchema)) b: z.infer<typeof CalendarsPutSchema>,
  ) {
    await this.acc(u.userId);
    await IntegrationAccountModel.updateOne(
      { userId: u.userId },
      { $set: { timetableCalendarIds: b.timetableCalendarIds, busyCalendarIds: b.busyCalendarIds, calendarsConfigured: true } },
    );
    return { ok: true };
  }

  @Post('sync')
  @HttpCode(200)
  sync(@CurrentUser() u: AuthedUser, @Body(new ZodPipe(SyncBody)) b: z.infer<typeof SyncBody>) {
    return this.google.sync(u.userId, !!b.force);
  }

  /** Incremental consent (e.g. drive.file): the device sends the new serverAuthCode. */
  @Post('code')
  @HttpCode(200)
  async code(@CurrentUser() u: AuthedUser, @Body(new ZodPipe(CodeBody)) b: z.infer<typeof CodeBody>) {
    const acc = await IntegrationAccountModel.findOne({ userId: u.userId }).lean();
    const ex = await this.identity.exchangeCode(b.serverAuthCode);
    const set: Record<string, unknown> = { scopes: [...new Set([...(acc?.scopes ?? []), ...ex.scopes])] };
    if (ex.refreshToken) set.refreshTokenEnc = encrypt(ex.refreshToken);
    await IntegrationAccountModel.updateOne({ userId: u.userId }, { $set: set });
    return { scopes: set.scopes };
  }
}
