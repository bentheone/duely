import { Body, Controller, Delete, ForbiddenException, Get, Header, HttpCode, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { z } from 'zod';
import {
  CommunityAckSchema,
  CommunityCreateSchema,
  CommunityJoinSchema,
  CommunityMemberPatchSchema,
  CommunityPostCreateSchema,
  ShareTokenSchema,
  uuidv7,
  type Colleague,
  type Community,
  type CommunityActivity,
  type CommunityInvite,
  type CommunityPost,
  type SharedItem,
} from '@duely/shared';
import { CurrentUser, Public, ZodPipe, type AuthedUser } from '../common/http';
import { CommunityModel, CommunityPostModel, UserModel, type CommunityDoc, type CommunityPostDoc } from '../db/models';
import { landingHtml, origin, token } from '../share/share.controller';
import { sharedFileDownload, snapshotItem } from '../share/snapshot';

const PAGE = 50;

/**
 * Course communities: anyone creates one for a course code, invites by link / QR, and members
 * post snapshots (assignments, exams, lectures, study sessions, resources). Members save copies
 * into their own data through /sync — the community never writes into anyone's account.
 */
@Controller()
export class CommunityController {
  private async load(id: string, userId: string): Promise<CommunityDoc> {
    const c = await CommunityModel.findOne({ _id: id, deletedAt: null }).lean();
    if (!c || !c.members.some((m) => m.userId === userId)) throw new NotFoundException('Community not found');
    return c;
  }

  private async view(c: CommunityDoc, userId: string, req: Request): Promise<Community> {
    const users = await UserModel.find({ _id: { $in: c.members.map((m) => m.userId) } }, { name: 1, avatarUrl: 1, username: 1 }).lean();
    const byId = new Map(users.map((u) => [u._id, u]));
    const me = c.members.find((m) => m.userId === userId);
    const unread = me
      ? await CommunityPostModel.countDocuments({ communityId: c._id, deletedAt: null, authorId: { $ne: userId }, createdAt: { $gt: me.lastSeenAt ?? me.joinedAt } })
      : 0;
    return {
      id: c._id,
      name: c.name,
      course: c.course,
      isOwner: c.ownerId === userId,
      members: c.members.map((m) => ({
        id: m.userId,
        name: byId.get(m.userId)?.name ?? 'Member',
        username: byId.get(m.userId)?.username ?? null,
        avatarUrl: byId.get(m.userId)?.avatarUrl ?? null,
        role: m.role,
      })),
      inviteToken: c.inviteToken,
      inviteUrl: `${origin(req)}/c/${c.inviteToken}`,
      createdAt: c.createdAt,
      lastPostAt: c.lastPostAt ?? null,
      myAutoSave: !!me?.autoSave,
      unread,
    };
  }

  @Post('communities')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async create(@CurrentUser() u: AuthedUser, @Req() req: Request, @Body(new ZodPipe(CommunityCreateSchema)) b: z.infer<typeof CommunityCreateSchema>) {
    const now = Date.now();
    const doc: CommunityDoc = {
      _id: uuidv7(),
      name: b.name,
      course: b.course,
      ownerId: u.userId,
      members: [{ userId: u.userId, role: 'owner', joinedAt: now, autoSave: false, autoSaveSince: null }],
      inviteToken: token(),
      createdAt: now,
      updatedAt: now,
      lastPostAt: null,
      deletedAt: null,
    };
    await CommunityModel.create(doc);
    return this.view(doc, u.userId, req);
  }

  @Get('communities')
  async mine(@CurrentUser() u: AuthedUser, @Req() req: Request): Promise<Community[]> {
    const rows = await CommunityModel.find({ 'members.userId': u.userId, deletedAt: null }).sort({ updatedAt: -1 }).limit(100).lean();
    return Promise.all(rows.map((c) => this.view(c, u.userId, req)));
  }

  @Get('communities/invite/:token')
  async invite(@CurrentUser() u: AuthedUser, @Param('token') t: string): Promise<CommunityInvite> {
    if (!ShareTokenSchema.safeParse(t).success) throw new NotFoundException();
    const c = await CommunityModel.findOne({ inviteToken: t, deletedAt: null }).lean();
    if (!c) throw new NotFoundException('This invite expired or was reset.');
    const owner = await UserModel.findById(c.ownerId, { name: 1 }).lean();
    return {
      communityId: c._id,
      name: c.name,
      course: c.course,
      memberCount: c.members.length,
      ownerName: (owner?.name ?? '').split(' ')[0] || 'Someone',
      alreadyMember: c.members.some((m) => m.userId === u.userId),
    };
  }

  @Post('communities/join')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async join(@CurrentUser() u: AuthedUser, @Req() req: Request, @Body(new ZodPipe(CommunityJoinSchema)) b: z.infer<typeof CommunityJoinSchema>) {
    const c = await CommunityModel.findOneAndUpdate(
      { inviteToken: b.token, deletedAt: null, 'members.userId': { $ne: u.userId } },
      {
        $push: { members: { userId: u.userId, role: 'member', joinedAt: Date.now(), autoSave: !!b.autoSave, autoSaveSince: b.autoSave ? Date.now() : null } },
        $set: { updatedAt: Date.now() },
      },
      { new: true },
    ).lean();
    const doc = c ?? (await CommunityModel.findOne({ inviteToken: b.token, deletedAt: null }).lean());
    if (!doc) throw new NotFoundException('This invite expired or was reset.');
    return this.view(doc, u.userId, req);
  }

  /** People I share a community with (joined theirs, or they joined mine). */
  @Get('colleagues')
  async colleagues(@CurrentUser() u: AuthedUser): Promise<Colleague[]> {
    const coms = await CommunityModel.find({ 'members.userId': u.userId, deletedAt: null }).lean();
    const shared = new Map<string, Colleague['communities']>();
    for (const c of coms)
      for (const m of c.members)
        if (m.userId !== u.userId) shared.set(m.userId, [...(shared.get(m.userId) ?? []), { id: c._id, name: c.name, course: c.course }]);
    const users = await UserModel.find({ _id: { $in: [...shared.keys()] } }, { name: 1, avatarUrl: 1, username: 1 }).lean();
    return users
      .map((x) => ({ id: x._id, name: x.name || 'Member', username: x.username ?? null, avatarUrl: x.avatarUrl ?? null, communities: shared.get(x._id) ?? [] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Others' posts in my communities since `since` (ms) — the app turns them into notifications. */
  @Get('communities/activity')
  async activity(@CurrentUser() u: AuthedUser, @Query('since') since?: string): Promise<CommunityActivity> {
    const now = Date.now();
    const from = since && /^\d+$/.test(since) ? Number(since) : now;
    const coms = await CommunityModel.find({ 'members.userId': u.userId, deletedAt: null }).lean();
    if (!coms.length) return { posts: [], now };
    const byId = new Map(coms.map((c) => [c._id, c]));
    const rows = await CommunityPostModel.find({ communityId: { $in: [...byId.keys()] }, deletedAt: null, authorId: { $ne: u.userId }, createdAt: { $gt: from, $lte: now } })
      .sort({ createdAt: 1 })
      .limit(30)
      .lean();
    const names = new Map((await UserModel.find({ _id: { $in: [...new Set(rows.map((r) => r.authorId))] } }, { name: 1 }).lean()).map((x) => [x._id, x.name]));
    return {
      now,
      posts: rows.map((p) => {
        const c = byId.get(p.communityId)!;
        const me = c.members.find((m) => m.userId === u.userId);
        const autoSavedForMe = !!p.autoSave && p.authorId === c.ownerId && !!me?.autoSave && p.createdAt >= (me.autoSaveSince ?? me.joinedAt);
        return { ...toPost(p, u.userId, names.get(p.authorId) ?? 'Member'), communityName: c.name, autoSavedForMe };
      }),
    };
  }

  /**
   * Creator posts marked auto-save, from communities where I opted in, that my account hasn't saved
   * yet. The app saves them through /sync and acks them.
   */
  @Get('communities/auto-saves')
  async autoSaves(@CurrentUser() u: AuthedUser): Promise<CommunityPost[]> {
    const coms = await CommunityModel.find({ deletedAt: null, members: { $elemMatch: { userId: u.userId, autoSave: true } } }).lean();
    const out: CommunityPost[] = [];
    for (const c of coms) {
      if (c.ownerId === u.userId) continue;
      const me = c.members.find((m) => m.userId === u.userId)!;
      const rows = await CommunityPostModel.find({
        communityId: c._id,
        deletedAt: null,
        autoSave: true,
        authorId: c.ownerId,
        kind: { $ne: 'resource' },
        savedBy: { $ne: u.userId },
        createdAt: { $gte: me.autoSaveSince ?? me.joinedAt },
      })
        .sort({ createdAt: 1 })
        .limit(50)
        .lean();
      const owner = await UserModel.findById(c.ownerId, { name: 1 }).lean();
      out.push(...rows.map((p) => toPost(p, u.userId, owner?.name ?? 'Creator')));
    }
    return out.slice(0, 100);
  }

  @Post('communities/auto-saves/ack')
  @HttpCode(204)
  async ackAutoSaves(@CurrentUser() u: AuthedUser, @Body(new ZodPipe(CommunityAckSchema)) b: z.infer<typeof CommunityAckSchema>) {
    const mine = (await CommunityModel.find({ 'members.userId': u.userId }, { _id: 1 }).lean()).map((c) => c._id);
    await CommunityPostModel.updateMany({ _id: { $in: b.ids }, communityId: { $in: mine } }, { $addToSet: { savedBy: u.userId } });
  }

  /** Opened the community: clears its unread badge (on every device). */
  @Post('communities/:id/seen')
  @HttpCode(204)
  async seen(@CurrentUser() u: AuthedUser, @Param('id') id: string) {
    await this.load(id, u.userId);
    await CommunityModel.updateOne({ _id: id, 'members.userId': u.userId }, { $set: { 'members.$.lastSeenAt': Date.now() } });
  }

  /** My membership settings (auto-save the creator's posts). */
  @Post('communities/:id/me')
  @HttpCode(200)
  async patchMe(@CurrentUser() u: AuthedUser, @Req() req: Request, @Param('id') id: string, @Body(new ZodPipe(CommunityMemberPatchSchema)) b: z.infer<typeof CommunityMemberPatchSchema>) {
    await this.load(id, u.userId);
    const doc = await CommunityModel.findOneAndUpdate(
      { _id: id, 'members.userId': u.userId },
      { $set: { 'members.$.autoSave': b.autoSave, 'members.$.autoSaveSince': b.autoSave ? Date.now() : null } },
      { new: true },
    ).lean();
    return this.view(doc!, u.userId, req);
  }

  @Get('communities/:id')
  async get(@CurrentUser() u: AuthedUser, @Req() req: Request, @Param('id') id: string) {
    return this.view(await this.load(id, u.userId), u.userId, req);
  }

  /** Leaving as the owner hands the community to the longest-standing member (or deletes it if alone). */
  @Post('communities/:id/leave')
  @HttpCode(204)
  async leave(@CurrentUser() u: AuthedUser, @Param('id') id: string) {
    const c = await this.load(id, u.userId);
    const rest = c.members.filter((m) => m.userId !== u.userId).sort((a, b) => a.joinedAt - b.joinedAt);
    if (!rest.length) {
      await CommunityModel.updateOne({ _id: id }, { $set: { deletedAt: Date.now() } });
      return;
    }
    const ownerId = c.ownerId === u.userId ? rest[0]!.userId : c.ownerId;
    await CommunityModel.updateOne(
      { _id: id },
      { $set: { members: rest.map((m) => ({ ...m, role: m.userId === ownerId ? 'owner' : 'member' })), ownerId, updatedAt: Date.now() } },
    );
  }

  @Delete('communities/:id')
  @HttpCode(204)
  async remove(@CurrentUser() u: AuthedUser, @Param('id') id: string) {
    const c = await this.load(id, u.userId);
    if (c.ownerId !== u.userId) throw new ForbiddenException('Only the owner can delete it');
    await CommunityModel.updateOne({ _id: id }, { $set: { deletedAt: Date.now() } });
  }

  /** New invite link/QR; the old one stops working. */
  @Post('communities/:id/invite/reset')
  @HttpCode(200)
  async resetInvite(@CurrentUser() u: AuthedUser, @Req() req: Request, @Param('id') id: string) {
    const c = await this.load(id, u.userId);
    if (c.ownerId !== u.userId) throw new ForbiddenException('Only the owner can reset the invite');
    const doc = await CommunityModel.findOneAndUpdate({ _id: id }, { $set: { inviteToken: token(), updatedAt: Date.now() } }, { new: true }).lean();
    return this.view(doc!, u.userId, req);
  }

  @Get('communities/:id/posts')
  async posts(@CurrentUser() u: AuthedUser, @Param('id') id: string, @Query('before') before?: string): Promise<CommunityPost[]> {
    await this.load(id, u.userId);
    const q: Record<string, unknown> = { communityId: id, deletedAt: null };
    if (before && /^\d+$/.test(before)) q.createdAt = { $lt: Number(before) };
    const rows = await CommunityPostModel.find(q).sort({ createdAt: -1 }).limit(PAGE).lean();
    const users = await UserModel.find({ _id: { $in: [...new Set(rows.map((r) => r.authorId))] } }, { name: 1 }).lean();
    const names = new Map(users.map((x) => [x._id, x.name]));
    return rows.map((p) => toPost(p, u.userId, names.get(p.authorId) ?? 'Member'));
  }

  @Post('communities/:id/posts')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async post(
    @CurrentUser() u: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodPipe(CommunityPostCreateSchema)) b: z.infer<typeof CommunityPostCreateSchema>,
  ): Promise<CommunityPost> {
    const c = await this.load(id, u.userId);
    const me = await UserModel.findById(u.userId, { name: 1 }).lean();
    let payload: Omit<SharedItem, 'token'>;
    if (b.kind === 'resource') {
      payload = {
        kind: 'resource',
        from: { name: (me?.name ?? '').split(' ')[0] || 'A member' },
        createdAt: Date.now(),
        course: c.course,
        files: [],
        resource: { title: b.title, url: b.url ?? null, note: b.note ?? '' },
      };
    } else {
      payload = await snapshotItem(u.userId, b.kind, b.id, c.course);
      // Saved copies land in the community's course.
      payload.course = c.course;
    }
    const now = Date.now();
    const doc: CommunityPostDoc = {
      _id: uuidv7(),
      communityId: id,
      authorId: u.userId,
      kind: b.kind,
      itemId: 'id' in b ? b.id : null,
      payload: payload as unknown as Record<string, unknown>,
      createdAt: now,
      deletedAt: null,
      // Only the creator can push items into members' accounts (and never links).
      autoSave: b.kind !== 'resource' && !!b.autoSave && c.ownerId === u.userId,
      savedBy: [],
    };
    await CommunityPostModel.create(doc);
    await CommunityModel.updateOne({ _id: id }, { $set: { lastPostAt: now, updatedAt: now } });
    return toPost(doc, u.userId, me?.name ?? 'Me');
  }

  @Delete('communities/:id/posts/:postId')
  @HttpCode(204)
  async deletePost(@CurrentUser() u: AuthedUser, @Param('id') id: string, @Param('postId') postId: string) {
    const c = await this.load(id, u.userId);
    const p = await CommunityPostModel.findOne({ _id: postId, communityId: id, deletedAt: null }).lean();
    if (!p) throw new NotFoundException();
    if (p.authorId !== u.userId && c.ownerId !== u.userId) throw new ForbiddenException('Only the author or owner can remove it');
    await CommunityPostModel.updateOne({ _id: postId }, { $set: { deletedAt: Date.now() } });
  }

  @Get('communities/:id/posts/:postId/files/:fileId')
  async file(@CurrentUser() u: AuthedUser, @Param('id') id: string, @Param('postId') postId: string, @Param('fileId') fileId: string) {
    await this.load(id, u.userId);
    const p = await CommunityPostModel.findOne({ _id: postId, communityId: id, deletedAt: null }).lean();
    const files = ((p?.payload as { files?: { id: string }[] } | undefined)?.files ?? []).map((f) => f.id);
    if (!p || !files.includes(fileId)) throw new NotFoundException();
    return sharedFileDownload(p.authorId, fileId);
  }

  @Public()
  @Get('c/:token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex')
  landing(@Param('token') t: string): string {
    const tok = ShareTokenSchema.safeParse(t).success ? t : '';
    return landingHtml(tok ? `community/join/${tok}` : null, 'You’re invited to a course community on Duely. Open it in the app to join.');
  }
}

function toPost(p: CommunityPostDoc, me: string, authorName: string): CommunityPost {
  return {
    id: p._id,
    communityId: p.communityId,
    author: { id: p.authorId, name: authorName },
    mine: p.authorId === me,
    item: { ...(p.payload as unknown as Omit<SharedItem, 'token'>), token: p._id },
    createdAt: p.createdAt,
    autoSave: !!p.autoSave,
  };
}
