import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  AccessRequestBodySchema,
  AccessRequestPatchSchema,
  FeedbackBodySchema,
  FeedbackPatchSchema,
  uuidv7,
  type AccessRequest,
  type FeedbackItem,
} from '@duely/shared';
import type { z } from 'zod';
import { CurrentUser, Public, ZodPipe, type AuthedUser } from '../common/http';
import { AccessRequestModel, FeedbackModel, UserModel, type AccessRequestDoc } from '../db/models';
import { config } from '../config';
import { isAdminEmail } from '../me/me.controller';
import { MAILER, brandedEmail, type Mailer } from '../mail/mailer';

type AccessBody = z.infer<typeof AccessRequestBodySchema>;
type FeedbackBody = z.infer<typeof FeedbackBodySchema>;

const toRequest = (d: AccessRequestDoc): AccessRequest => ({
  id: d._id,
  email: d.email,
  name: d.name ?? null,
  status: d.status,
  requests: d.requests ?? 1,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
  notifiedAt: d.notifiedAt ?? null,
});

/**
 * People Google blocks while the OAuth consent screen is in "Testing" leave their Gmail here.
 * Public + tightly throttled; the response never says whether the email was already known.
 */
@Controller('access-requests')
export class AccessRequestController {
  private readonly log = new Logger('AccessRequests');
  constructor(@Inject(MAILER) private readonly mailer: Mailer) {}

  @Public()
  @Post()
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async create(@Body(new ZodPipe(AccessRequestBodySchema)) body: AccessBody) {
    const now = Date.now();
    const existing = await AccessRequestModel.findOne({ email: body.email }).lean();
    if (existing) {
      await AccessRequestModel.updateOne(
        { _id: existing._id },
        {
          $set: { updatedAt: now, ...(body.name ? { name: body.name } : {}), ...(existing.status === 'dismissed' ? { status: 'pending' } : {}) },
          $inc: { requests: 1 },
        },
      );
    } else {
      await AccessRequestModel.create({ _id: uuidv7(), email: body.email, name: body.name ?? null, status: 'pending', requests: 1, createdAt: now, updatedAt: now });
      // Tell the admins so they can add the email in Google Cloud → OAuth consent screen → Test users.
      if (this.mailer.configured) {
        const admins = config().adminEmails;
        for (const to of admins) {
          await this.mailer
            .send({
              to,
              subject: `Duely access request: ${body.email}`,
              text: `${body.name ? `${body.name} ` : ''}<${body.email}> asked to use Duely.\nAdd them as a test user in Google Cloud, then tap Notify in Duely → Admin.`,
              html: brandedEmail({
                title: 'New access request',
                lines: [`${body.name ? `${body.name} · ` : ''}${body.email}`, 'Add them as a test user in Google Cloud, then tap Notify in Duely → Admin.'],
                button: { label: 'Open test users', url: 'https://console.cloud.google.com/auth/audience' },
              }),
            })
            .catch((e: Error) => this.log.warn(`admin notify failed: ${e.message}`));
        }
      }
    }
    return { ok: true };
  }
}

@Controller('feedback')
export class FeedbackController {
  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async create(@CurrentUser() u: AuthedUser, @Body(new ZodPipe(FeedbackBodySchema)) body: FeedbackBody) {
    const id = uuidv7();
    await FeedbackModel.create({
      _id: id,
      userId: u.userId,
      kind: body.kind,
      message: body.message,
      appVersion: body.appVersion ?? null,
      device: body.device ?? null,
      read: false,
      createdAt: Date.now(),
    });
    return { id };
  }
}

/** Admin dashboard API — every route checks the caller's email against ADMIN_EMAILS / OWNER_EMAIL. */
@Controller('admin')
export class AdminController {
  constructor(@Inject(MAILER) private readonly mailer: Mailer) {}

  private async assertAdmin(u: AuthedUser) {
    const user = await UserModel.findById(u.userId, { email: 1 }).lean();
    if (!user || !isAdminEmail(user.email)) throw new ForbiddenException('Admins only');
  }

  @Get('summary')
  async summary(@CurrentUser() u: AuthedUser) {
    await this.assertAdmin(u);
    const [pending, unread] = await Promise.all([
      AccessRequestModel.countDocuments({ status: 'pending' }),
      FeedbackModel.countDocuments({ read: false }),
    ]);
    return { pendingRequests: pending, unreadFeedback: unread, emailConfigured: this.mailer.configured };
  }

  @Get('access-requests')
  async listRequests(@CurrentUser() u: AuthedUser): Promise<AccessRequest[]> {
    await this.assertAdmin(u);
    const rows = await AccessRequestModel.find({}).sort({ updatedAt: -1 }).limit(500).lean();
    return rows.map(toRequest);
  }

  @Patch('access-requests/:id')
  async patchRequest(
    @CurrentUser() u: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodPipe(AccessRequestPatchSchema)) body: { status: AccessRequest['status'] },
  ): Promise<AccessRequest> {
    await this.assertAdmin(u);
    const doc = await AccessRequestModel.findOneAndUpdate({ _id: id }, { $set: { status: body.status, updatedAt: Date.now() } }, { new: true }).lean();
    if (!doc) throw new NotFoundException();
    return toRequest(doc);
  }

  /** "You're in" email over SMTP; marks the request notified. */
  @Post('access-requests/:id/notify')
  @HttpCode(200)
  async notify(@CurrentUser() u: AuthedUser, @Param('id') id: string): Promise<AccessRequest> {
    await this.assertAdmin(u);
    const doc = await AccessRequestModel.findById(id).lean();
    if (!doc) throw new NotFoundException();
    if (!this.mailer.configured) throw new ServiceUnavailableException("Email isn't set up on the server (SMTP_HOST, SMTP_USER, SMTP_PASS).");
    const download = config().appDownloadUrl;
    const lines = [
      `${doc.name ? `Hi ${doc.name.split(' ')[0]}, you` : 'You'}'re now on the Duely testers list.`,
      'Open Duely and tap “Sign in with Google” again — it will work now.',
      ...(download ? ["Don't have the app yet? Download it below."] : []),
    ];
    await this.mailer.send({
      to: doc.email,
      subject: "You're in — sign in to Duely",
      text: `${lines.join('\n')}${download ? `\n${download}` : ''}`,
      html: brandedEmail({ title: "You're in", lines, button: download ? { label: 'Get Duely', url: download } : undefined }),
    });
    const now = Date.now();
    const updated = await AccessRequestModel.findOneAndUpdate({ _id: id }, { $set: { status: 'notified', notifiedAt: now, updatedAt: now } }, { new: true }).lean();
    return toRequest(updated!);
  }

  @Delete('access-requests/:id')
  @HttpCode(204)
  async deleteRequest(@CurrentUser() u: AuthedUser, @Param('id') id: string) {
    await this.assertAdmin(u);
    await AccessRequestModel.deleteOne({ _id: id });
  }

  @Get('feedback')
  async listFeedback(@CurrentUser() u: AuthedUser): Promise<FeedbackItem[]> {
    await this.assertAdmin(u);
    const rows = await FeedbackModel.find({}).sort({ createdAt: -1 }).limit(500).lean();
    const users = await UserModel.find({ _id: { $in: [...new Set(rows.map((r) => r.userId))] } }, { email: 1, name: 1 }).lean();
    const byId = new Map(users.map((x) => [x._id, x]));
    return rows.map((r) => ({
      id: r._id,
      kind: r.kind,
      message: r.message,
      email: byId.get(r.userId)?.email ?? '',
      name: byId.get(r.userId)?.name ?? '',
      appVersion: r.appVersion ?? null,
      device: r.device ?? null,
      read: !!r.read,
      createdAt: r.createdAt,
    }));
  }

  @Patch('feedback/:id')
  @HttpCode(204)
  async patchFeedback(@CurrentUser() u: AuthedUser, @Param('id') id: string, @Body(new ZodPipe(FeedbackPatchSchema)) body: { read: boolean }) {
    await this.assertAdmin(u);
    const r = await FeedbackModel.updateOne({ _id: id }, { $set: { read: body.read } });
    if (r.matchedCount === 0) throw new NotFoundException();
  }
}
