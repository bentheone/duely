import { randomBytes } from 'node:crypto';
import { BadRequestException, Body, Controller, Get, Header, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { z } from 'zod';
import { ShareCreateSchema, ShareTokenSchema, type SharedItem } from '@duely/shared';
import { CurrentUser, Public, ZodPipe, type AuthedUser } from '../common/http';
import { AssignmentModel, CourseModel, ExamModel, FileAttachmentModel, ShareModel, SubtaskModel, UserModel } from '../db/models';
import { cloudinaryCredsFor, cloudinaryDownload } from '../storage/storage.controller';
import { config } from '../config';

const TTL_MS = 90 * 24 * 3600_000;
const ANDROID_PACKAGE = 'app.duely';

type Doc = Record<string, unknown>;
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const num = (v: unknown) => (typeof v === 'number' ? v : null);

function token(): string {
  return randomBytes(12).toString('base64url');
}

function validToken(t: string): string {
  if (!ShareTokenSchema.safeParse(t).success) throw new NotFoundException();
  return t;
}

/** Public link host: the API's own origin (Vercel sets x-forwarded-proto/host). */
function origin(req: Request): string {
  const proto = str(req.headers['x-forwarded-proto']).split(',')[0] || req.protocol || 'https';
  const host = str(req.headers['x-forwarded-host']) || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/**
 * Sharing an assignment or exam with a friend. The sender's server copy is snapshotted; the friend
 * opens the link in Duely (signed in) and the app saves its own copy via /sync — one write path.
 */
@Controller()
export class ShareController {
  @Post('shares')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async create(@CurrentUser() u: AuthedUser, @Req() req: Request, @Body(new ZodPipe(ShareCreateSchema)) b: z.infer<typeof ShareCreateSchema>) {
    const payload = await this.snapshot(u.userId, b.kind, b.id);
    const now = Date.now();
    const existing = await ShareModel.findOne({ userId: u.userId, kind: b.kind, itemId: b.id }).lean();
    const id = existing?._id ?? token();
    await ShareModel.updateOne(
      { _id: id },
      {
        $set: { userId: u.userId, kind: b.kind, itemId: b.id, payload, updatedAt: now, expiresAt: new Date(now + TTL_MS) },
        $setOnInsert: { createdAt: now, opens: 0 },
      },
      { upsert: true },
    );
    return { token: id, url: `${origin(req)}/s/${id}` };
  }

  @Get('shares/:token')
  async get(@Param('token') t: string): Promise<SharedItem> {
    const doc = await ShareModel.findOneAndUpdate({ _id: validToken(t), expiresAt: { $gt: new Date() } }, { $inc: { opens: 1 } }, { new: true }).lean();
    if (!doc) throw new NotFoundException('This link has expired or was removed.');
    return { ...(doc.payload as unknown as Omit<SharedItem, 'token'>), token: doc._id };
  }

  /** Download URL for one attachment of a share, signed with the sender's storage (expires in 1 h). */
  @Get('shares/:token/files/:fileId')
  async file(@Param('token') t: string, @Param('fileId') fileId: string) {
    const doc = await ShareModel.findOne({ _id: validToken(t), expiresAt: { $gt: new Date() } }).lean();
    const files = ((doc?.payload as { files?: { id: string }[] } | undefined)?.files ?? []).map((f) => f.id);
    if (!doc || !files.includes(fileId)) throw new NotFoundException();
    const f = await FileAttachmentModel.findOne({ _id: fileId, userId: doc.userId, deletedAt: null }).lean();
    if (!f || !f.remoteId || f.provider !== 'cloudinary') throw new NotFoundException('File not available');
    const c = await cloudinaryCredsFor(doc.userId);
    if (!c) throw new NotFoundException('File not available');
    return cloudinaryDownload(c, String(f.remoteId), String(f.mime), (f.remoteUrl as string | null | undefined) ?? null);
  }

  /** Landing page for the link: opens Duely (Android intent), or points to the download. Shows no content. */
  @Public()
  @Get('s/:token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex')
  landing(@Param('token') t: string): string {
    const tok = ShareTokenSchema.safeParse(t).success ? t : '';
    const download = config().appDownloadUrl;
    const deep = `duely://share/${tok}`;
    const intent = `intent://share/${tok}#Intent;scheme=duely;package=${ANDROID_PACKAGE};${download ? `S.browser_fallback_url=${encodeURIComponent(download)};` : ''}end`;
    const btn = (href: string, label: string, dark: boolean) =>
      `<a href="${escapeHtml(href)}" style="display:block;margin-top:12px;padding:16px;border-radius:999px;text-align:center;text-decoration:none;font-weight:600;${dark ? 'background:#111317;color:#fff' : 'background:#F1F2F4;color:#111317'}">${label}</a>`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Open in Duely</title></head>
<body style="margin:0;font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;background:#fff;color:#111317">
<main style="max-width:420px;margin:0 auto;padding:64px 28px">
<div style="font-size:40px;font-weight:700;letter-spacing:-1px">duely<span style="color:#EA580C">.</span></div>
<p style="font-size:18px;color:#5B6069;margin-top:24px">A friend shared an assignment or exam with you. It opens in the Duely app.</p>
${tok ? btn(intent, 'Open in Duely', true) + btn(deep, 'Already have it? Tap here', false) : '<p>This link is not valid.</p>'}
${download ? btn(download, 'Get Duely', false) : ''}
</main>
<script>if(/Android/i.test(navigator.userAgent)&&${JSON.stringify(!!tok)}){location.href=${JSON.stringify(intent)};}</script>
</body></html>`;
  }

  private async snapshot(userId: string, kind: 'assignment' | 'exam', id: string): Promise<Omit<SharedItem, 'token'>> {
    const Model = kind === 'assignment' ? AssignmentModel : ExamModel;
    const item = (await Model.findOne({ _id: id, userId, deletedAt: null }).lean()) as Doc | null;
    if (!item) throw new NotFoundException();
    const [course, user, files] = await Promise.all([
      CourseModel.findOne({ _id: item.courseId, userId }).lean() as Promise<Doc | null>,
      UserModel.findById(userId, { name: 1 }).lean(),
      FileAttachmentModel.find({ userId, ownerType: kind, ownerId: id, deletedAt: null, provider: 'cloudinary', remoteId: { $ne: null } }).lean() as Promise<Doc[]>,
    ]);
    if (!course) throw new BadRequestException('Course not found');
    const base = {
      kind,
      from: { name: (user?.name ?? '').split(' ')[0] || 'A friend' },
      createdAt: Date.now(),
      course: { code: str(course.code), shortName: str(course.shortName), title: str(course.title), color: str(course.color, '#2563EB') },
      files: files.map((f) => ({ id: String(f._id), name: str(f.name, 'file'), mime: str(f.mime), size: num(f.size) ?? 0 })),
    };
    if (kind === 'exam') {
      const topics = Array.isArray(item.topics) ? (item.topics as { title?: unknown }[]) : [];
      return {
        ...base,
        exam: {
          type: str(item.type, 'other') as NonNullable<SharedItem['exam']>['type'],
          startsAt: num(item.startsAt) ?? Date.now(),
          durationMin: num(item.durationMin),
          room: str(item.room) || null,
          topics: topics.map((x) => ({ title: str(x.title) })).filter((x) => x.title),
          notes: str(item.notes),
        },
      };
    }
    const subtasks = (await SubtaskModel.find({ userId, assignmentId: id, deletedAt: null }).sort({ order: 1 }).lean()) as Doc[];
    const group = (item.group as NonNullable<SharedItem['assignment']>['group']) ?? null;
    return {
      ...base,
      assignment: {
        title: str(item.title, 'Assignment'),
        notes: str(item.notes),
        links: Array.isArray(item.links) ? (item.links as { title: string; url: string }[]) : [],
        dueAt: num(item.dueAt),
        kind: item.kind === 'group' ? 'group' : 'individual',
        submission: str(item.submission, 'moodle') as NonNullable<SharedItem['assignment']>['submission'],
        marks: num(item.marks),
        group: group
          ? {
              members: (group.members ?? []).map((m) => ({ name: m.isMe ? user?.name || m.name : m.name, phone: m.phone ?? null, whatsapp: m.whatsapp ?? null, isMe: false })),
              myPart: null, // the sender's own part stays theirs
              meetings: group.meetings ?? [],
              chatLink: group.chatLink ?? null,
            }
          : null,
        subtasks: subtasks.map((s) => ({ title: str(s.title), dueAt: num(s.dueAt), order: num(s.order) ?? 0 })),
      },
    };
  }
}
