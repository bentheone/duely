import { randomBytes } from 'node:crypto';
import { Body, Controller, Get, Header, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { z } from 'zod';
import { ShareCreateSchema, ShareTokenSchema, type SharedItem } from '@duely/shared';
import { CurrentUser, Public, ZodPipe, type AuthedUser } from '../common/http';
import { ShareModel } from '../db/models';
import { sharedFileDownload, snapshotItem } from './snapshot';
import { config } from '../config';

const TTL_MS = 90 * 24 * 3600_000;
const ANDROID_PACKAGE = 'app.duely';

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

export function token(): string {
  return randomBytes(12).toString('base64url');
}

function validToken(t: string): string {
  if (!ShareTokenSchema.safeParse(t).success) throw new NotFoundException();
  return t;
}

/** Public link host: the API's own origin (Vercel sets x-forwarded-proto/host). */
export function origin(req: Request): string {
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
    const payload = await snapshotItem(u.userId, b.kind, b.id);
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
    return sharedFileDownload(doc.userId, fileId);
  }

  /** Landing page for the link: opens Duely (Android intent), or points to the download. Shows no content. */
  @Public()
  @Get('s/:token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex')
  landing(@Param('token') t: string): string {
    const tok = ShareTokenSchema.safeParse(t).success ? t : '';
    return landingHtml(tok ? `share/${tok}` : null, 'A friend shared an assignment, exam or lecture with you. It opens in the Duely app.');
  }
}

/** Tiny page behind every Duely link: opens the app on Android, else offers the download. */
export function landingHtml(path: string | null, message: string): string {
  const download = config().appDownloadUrl;
  const deep = `duely://${path ?? ''}`;
  const intent = `intent://${path ?? ''}#Intent;scheme=duely;package=${ANDROID_PACKAGE};${download ? `S.browser_fallback_url=${encodeURIComponent(download)};` : ''}end`;
  const btn = (href: string, label: string, dark: boolean) =>
    `<a href="${escapeHtml(href)}" style="display:block;margin-top:12px;padding:16px;border-radius:999px;text-align:center;text-decoration:none;font-weight:600;${dark ? 'background:#111317;color:#fff' : 'background:#F1F2F4;color:#111317'}">${label}</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Open in Duely</title></head>
<body style="margin:0;font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;background:#fff;color:#111317">
<main style="max-width:420px;margin:0 auto;padding:64px 28px">
<div style="font-size:40px;font-weight:700;letter-spacing:-1px">duely<span style="color:#EA580C">.</span></div>
<p style="font-size:18px;color:#5B6069;margin-top:24px">${escapeHtml(message)}</p>
${path ? btn(intent, 'Open in Duely', true) + btn(deep, 'Already have it? Tap here', false) : '<p>This link is not valid.</p>'}
${download ? btn(download, 'Get Duely', false) : ''}
</main>
<script>if(/Android/i.test(navigator.userAgent)&&${JSON.stringify(!!path)}){location.href=${JSON.stringify(intent)};}</script>
</body></html>`;
}
