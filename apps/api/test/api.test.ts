import { BadGatewayException, ForbiddenException } from '@nestjs/common';
import { googleCodeError } from '../src/auth/google-identity';
import { uuidv7, zonedTime } from '@duely/shared';
import { IntegrationAccountModel, UserModel } from '../src/db/models';
import { decrypt, encrypt } from '../src/common/crypto';
import { cloudinarySignature } from '../src/storage/storage.controller';
import { base, setup, teardown, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => {
  await teardown(ctx);
});

const semester = (id = uuidv7(), t = Date.now()) => ({
  ...base(id, t),
  name: 'Fall 2026',
  startsOn: '2026-09-01',
  endsOn: '2026-12-20',
  status: 'active',
});
const course = (id: string, semesterId: string, t = Date.now(), extra: Record<string, unknown> = {}) => ({
  ...base(id, t),
  semesterId,
  code: 'INSY 8311',
  title: 'Database Programming',
  shortName: 'PL/SQL',
  color: '#EA580C',
  status: 'active',
  matchRules: ['insy8311', 'pl/sql'],
  ...extra,
});
const assignment = (id: string, courseId: string, semesterId: string, t = Date.now(), extra: Record<string, unknown> = {}) => ({
  ...base(id, t),
  courseId,
  semesterId,
  title: 'Lab on cursors',
  notes: '',
  links: [],
  dueAt: Date.now() + 3 * 86400000,
  kind: 'group',
  submission: 'moodle',
  status: 'not_started',
  progressMode: 'auto',
  ...extra,
});

describe('health & crypto', () => {
  test('GET /health is public', async () => {
    const r = await ctx.http().get('/health').expect(200);
    expect(r.body.ok).toBe(true);
  });
  test('AES-GCM round trip, random IV', () => {
    const a = encrypt('secret');
    expect(a).not.toBe(encrypt('secret'));
    expect(decrypt(a)).toBe('secret');
  });
  test('protected routes need a token', async () => {
    await ctx.http().get('/me').expect(401);
    await ctx.http().get('/me').set('Authorization', 'Bearer nope').expect(401);
  });
});

describe('auth', () => {
  test('google sign-in stores encrypted refresh token and returns user', async () => {
    const t = await ctx.signIn('auth1');
    const acc = await IntegrationAccountModel.findOne({ userId: t.userId }).lean();
    expect(acc!.refreshTokenEnc).toBeTruthy();
    expect(acc!.refreshTokenEnc).not.toContain('google-refresh');
    expect(decrypt(acc!.refreshTokenEnc!)).toBe('google-refresh');
    const me = await ctx.http().get('/me').set('Authorization', `Bearer ${t.accessToken}`).expect(200);
    expect(me.body.user.timezone).toBe('Africa/Kigali');
    expect(me.body.user.settings.alarm.leadMinutes).toBe(30);
    expect(me.body.google.connected).toBe(true);
  });

  test('refresh rotation + reuse detection revokes the family', async () => {
    const t = await ctx.signIn('auth2');
    const r1 = await ctx.http().post('/auth/refresh').send({ refreshToken: t.refreshToken }).expect(200);
    expect(r1.body.refreshToken).not.toBe(t.refreshToken);
    // Reusing the old token → 401, and the new one is revoked too.
    await ctx.http().post('/auth/refresh').send({ refreshToken: t.refreshToken }).expect(401);
    await ctx.http().post('/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
  });

  test('logout revokes refresh token', async () => {
    const t = await ctx.signIn('auth3');
    await ctx.http().post('/auth/logout').send({ refreshToken: t.refreshToken }).expect(204);
    await ctx.http().post('/auth/refresh').send({ refreshToken: t.refreshToken }).expect(401);
  });

  test('PATCH /me/settings deep-merges and validates', async () => {
    const t = await ctx.signIn('auth4');
    const r = await ctx
      .http()
      .patch('/me/settings')
      .set('Authorization', `Bearer ${t.accessToken}`)
      .send({ alarm: { leadMinutes: 20 }, activeSemesterId: 'sem1' })
      .expect(200);
    expect(r.body.settings.alarm.leadMinutes).toBe(20);
    expect(r.body.settings.alarm.snoozeMinutes).toBe(5);
    expect(r.body.activeSemesterId).toBe('sem1');
    await ctx.http().patch('/me/settings').set('Authorization', `Bearer ${t.accessToken}`).send({ alarm: { leadMinutes: -5 } }).expect(400);
  });

  test('personal API tokens only work on export routes', async () => {
    const t = await ctx.signIn('auth5');
    const auth = { Authorization: `Bearer ${t.accessToken}` };
    const pat = await ctx.http().post('/auth/tokens').set(auth).send({ name: 'Mac' }).expect(201);
    expect(pat.body.token).toMatch(/^duely_pat_/);
    await ctx.http().get('/export/reminders').set('Authorization', `Bearer ${pat.body.token}`).expect(200);
    await ctx.http().get('/me').set('Authorization', `Bearer ${pat.body.token}`).expect(401);
    const list = await ctx.http().get('/auth/tokens').set(auth).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].token).toBeUndefined();
    await ctx.http().delete(`/auth/tokens/${pat.body.id}`).set(auth).expect(204);
    await ctx.http().get('/export/reminders').set('Authorization', `Bearer ${pat.body.token}`).expect(401);
  });
});

describe('sync', () => {
  test('push → pull round trip with rev', async () => {
    const t = await ctx.signIn('sync1');
    const auth = { Authorization: `Bearer ${t.accessToken}` };
    const sem = semester();
    const c = course(uuidv7(), sem.id);
    const push = await ctx
      .http()
      .post('/sync/push')
      .set(auth)
      .send({ changes: [{ table: 'semesters', record: sem }, { table: 'courses', record: c }] })
      .expect(200);
    expect(push.body.accepted).toEqual([sem.id, c.id]);
    const pull = await ctx.http().get('/sync/pull?since=0').set(auth).expect(200);
    expect(pull.body.changes).toHaveLength(2);
    expect(pull.body.changes[1].record.userId).toBe(t.userId);
    expect(pull.body.maxRev).toBe(2);
    const again = await ctx.http().get(`/sync/pull?since=${pull.body.maxRev}`).set(auth).expect(200);
    expect(again.body.changes).toHaveLength(0);
  });

  test('last-write-wins on updatedAt; older write is a conflict returning server copy', async () => {
    const t = await ctx.signIn('sync2');
    const auth = { Authorization: `Bearer ${t.accessToken}` };
    const sem = semester(uuidv7(), 1000);
    const id = uuidv7();
    await ctx.http().post('/sync/push').set(auth).send({ changes: [{ table: 'courses', record: course(id, sem.id, 2000, { shortName: 'New' }) }] }).expect(200);
    const stale = await ctx
      .http()
      .post('/sync/push')
      .set(auth)
      .send({ changes: [{ table: 'courses', record: course(id, sem.id, 1500, { shortName: 'Old' }) }] })
      .expect(200);
    expect(stale.body.accepted).toEqual([]);
    expect(stale.body.conflicts[0].record.shortName).toBe('New');
    const newer = await ctx
      .http()
      .post('/sync/push')
      .set(auth)
      .send({ changes: [{ table: 'courses', record: course(id, sem.id, 3000, { shortName: 'Newest', status: 'finished' }) }] })
      .expect(200);
    expect(newer.body.accepted).toEqual([id]);
  });

  test('per-user scoping: other users cannot read or overwrite', async () => {
    const a = await ctx.signIn('sync3a');
    const b = await ctx.signIn('sync3b');
    const id = uuidv7();
    await ctx.http().post('/sync/push').set({ Authorization: `Bearer ${a.accessToken}` }).send({ changes: [{ table: 'semesters', record: semester(id, 1000) }] }).expect(200);
    const hijack = await ctx
      .http()
      .post('/sync/push')
      .set({ Authorization: `Bearer ${b.accessToken}` })
      .send({ changes: [{ table: 'semesters', record: { ...semester(id, 9999), userId: a.userId } }] })
      .expect(200);
    expect(hijack.body.rejected[0].id).toBe(id);
    const pull = await ctx.http().get('/sync/pull?since=0').set({ Authorization: `Bearer ${b.accessToken}` }).expect(200);
    expect(pull.body.changes).toHaveLength(0);
  });

  test('rejects invalid records, unknown tables and server-managed tables', async () => {
    const t = await ctx.signIn('sync4');
    const r = await ctx
      .http()
      .post('/sync/push')
      .set({ Authorization: `Bearer ${t.accessToken}` })
      .send({
        changes: [
          { table: 'courses', record: { ...course(uuidv7(), 's'), color: 'red' } },
          { table: 'nope', record: { id: 'x' } },
          { table: 'classSessions', record: { id: 'y' } },
        ],
      })
      .expect(200);
    expect(r.body.rejected).toHaveLength(3);
  });

  test('soft deletes travel through pull', async () => {
    const t = await ctx.signIn('sync5');
    const auth = { Authorization: `Bearer ${t.accessToken}` };
    const sem = semester(uuidv7(), 1000);
    await ctx.http().post('/sync/push').set(auth).send({ changes: [{ table: 'semesters', record: sem }] });
    await ctx.http().post('/sync/push').set(auth).send({ changes: [{ table: 'semesters', record: { ...sem, updatedAt: 2000, deletedAt: 2000 } }] });
    const pull = await ctx.http().get('/sync/pull?since=1').set(auth).expect(200);
    expect(pull.body.changes[0].record.deletedAt).toBe(2000);
  });
});

describe('google sync (mocked googleapis)', () => {
  test('timetable → class sessions, Duely calendar sessions, School tasks two-way', async () => {
    const t = await ctx.signIn('g1');
    const auth = { Authorization: `Bearer ${t.accessToken}` };
    const g = ctx.google;
    g.calendars.push({ id: 'timetable@x', summary: 'AUCA Timetable', primary: false });
    const day = 86400000;
    const now = Date.now();
    g.events.set('timetable@x', [
      { id: 'e1', summary: 'INSY 8311 PL/SQL', location: 'GB6', start: now + day, end: now + day + 7200000, recurringEventId: 'r1' },
      { id: 'e2', summary: 'Mystery seminar', start: now + day, end: now + day + 3600000, recurringEventId: 'r2' },
    ]);

    const cals = await ctx.http().get('/integrations/google/calendars').set(auth).expect(200);
    expect(cals.body.find((c: { id: string }) => c.id === 'primary@x').busy).toBe(true);
    await ctx.http().put('/integrations/google/calendars').set(auth).send({ timetableCalendarIds: ['timetable@x'], busyCalendarIds: ['primary@x'] }).expect(200);

    const sem = semester();
    const c = course(uuidv7(), sem.id);
    const a = assignment(uuidv7(), c.id, sem.id);
    const sub = { ...base(uuidv7()), assignmentId: a.id, title: 'Outline', done: false, order: 0 };
    const sess = { ...base(uuidv7()), kind: 'work', assignmentId: a.id, title: 'Lab on cursors', start: now + 2 * day, end: now + 2 * day + 5400000, status: 'confirmed' };
    await ctx
      .http()
      .post('/sync/push')
      .set(auth)
      .send({
        changes: [
          { table: 'semesters', record: sem },
          { table: 'courses', record: c },
          { table: 'assignments', record: a },
          { table: 'subtasks', record: sub },
          { table: 'sessions', record: sess },
        ],
      })
      .expect(200);

    const s1 = await ctx.http().post('/integrations/google/sync').set(auth).send({ force: true }).expect(200);
    expect(s1.body.classSessions).toBe(1);
    expect(s1.body.unmatchedEvents).toEqual([{ eventId: 'r2', title: 'Mystery seminar', calendarId: 'timetable@x', recurring: true }]);
    expect(s1.body.sessionsWritten).toBe(1);
    expect(g.calls).toContain('createCalendar:Duely');
    expect(g.calls).toContain('insertEvent:PL/SQL · Lab on cursors');
    expect(g.calls).toContain('insertTask:PL/SQL — Lab on cursors');
    expect(g.taskLists.map((l) => l.title)).toContain('School');
    const parentTask = [...g.tasks.values()].find((x) => x.title === 'PL/SQL — Lab on cursors')!;
    expect(parentTask.notes).toMatch(/^Due \d\d:\d\d · group · moodle\nduely:\/\/assignment\//);
    expect(parentTask.due).toMatch(/T00:00:00.000Z$/);
    const child = [...g.tasks.values()].find((x) => x.title === 'Outline')!;
    expect(child.parent).toBe(parentTask.id);

    // Debounced unless forced.
    const s2 = await ctx.http().post('/integrations/google/sync').set(auth).send({}).expect(200);
    expect(s2.body.skipped).toBe('debounced');

    // Complete in Google → assignment done in Duely.
    await new Promise((r) => setTimeout(r, 5));
    parentTask.status = 'completed';
    parentTask.updated = new Date(Date.now() + 60_000).toISOString();
    await ctx.http().post('/integrations/google/sync').set(auth).send({ force: true }).expect(200);
    const pull = await ctx.http().get('/sync/pull?since=0').set(auth).expect(200);
    const asg = pull.body.changes.find((ch: { table: string; record: { id: string } }) => ch.table === 'assignments' && ch.record.id === a.id);
    expect(asg.record.status).toBe('done');
    expect(asg.record.googleTaskId).toBe(parentTask.id);
    const cs = pull.body.changes.filter((ch: { table: string }) => ch.table === 'classSessions');
    expect(cs).toHaveLength(1);
    expect(cs[0].record.courseId).toBe(c.id);
    expect(cs[0].record.room).toBe('GB6');
    const ses = pull.body.changes.find((ch: { table: string }) => ch.table === 'sessions');
    expect(ses.record.googleEventId).toBeTruthy();
  });

  test('finished courses are not pushed to Tasks', async () => {
    const t = await ctx.signIn('g2');
    const auth = { Authorization: `Bearer ${t.accessToken}` };
    const sem = semester();
    const c = course(uuidv7(), sem.id, Date.now(), { status: 'finished', shortName: 'Old' });
    const a = assignment(uuidv7(), c.id, sem.id, Date.now(), { title: 'Archived work' });
    await ctx.http().post('/sync/push').set(auth).send({ changes: [{ table: 'courses', record: c }, { table: 'assignments', record: a }] });
    await ctx.http().post('/integrations/google/sync').set(auth).send({ force: true }).expect(200);
    expect(ctx.google.calls).not.toContain('insertTask:Old — Archived work');
  });

  test('planner suggests slots before due, avoiding busy', async () => {
    const t = await ctx.signIn('p1');
    const auth = { Authorization: `Bearer ${t.accessToken}` };
    const sem = semester();
    const c = course(uuidv7(), sem.id);
    const now = Date.now();
    const due = now + 4 * 86400000;
    const a = assignment(uuidv7(), c.id, sem.id, now, { dueAt: due });
    await ctx.http().post('/sync/push').set(auth).send({ changes: [{ table: 'courses', record: c }, { table: 'assignments', record: a }] });
    const r = await ctx.http().post('/planner/suggest').set(auth).send({ assignmentId: a.id, totalMinutes: 180 }).expect(200);
    expect(r.body.suggestions.length).toBeGreaterThan(0);
    for (const s of r.body.suggestions) {
      expect(s.end).toBeLessThanOrEqual(due);
      expect(s.status).toBe('suggested');
    }
    await ctx.http().post('/planner/suggest').set(auth).send({ totalMinutes: 60 }).expect(400);
  });
});

describe('storage', () => {
  test('owner gets owner Cloudinary by default and signed uploads', async () => {
    const t = await ctx.signIn('owner', 'owner@example.com');
    const auth = { Authorization: `Bearer ${t.accessToken}` };
    const info = await ctx.http().get('/storage').set(auth).expect(200);
    expect(info.body).toMatchObject({ provider: 'cloudinary', usingOwnerCloudinary: true, cloudName: 'ownercloud' });
    const s = await ctx
      .http()
      .post('/files/sign')
      .set(auth)
      .send({ attachmentId: 'att1', resourceType: 'raw', folder: 'Fall 2026/PL/SQL', mime: 'application/pdf', size: 1000 })
      .expect(200);
    expect(s.body.publicId).toBe('att1.pdf');
    expect(s.body.folder).toBe('duely/Fall 2026/PL/SQL');
    expect(s.body.signature).toMatch(/^[0-9a-f]{40}$/);
    expect(JSON.stringify(s.body)).not.toContain('ownersecret');
    await ctx.http().post('/files/sign').set(auth).send({ attachmentId: 'a', resourceType: 'raw', mime: 'application/x-msdownload', size: 10 }).expect(400);
    await ctx.http().post('/files/sign').set(auth).send({ attachmentId: 'a', resourceType: 'raw', mime: 'application/pdf', size: 26 * 1024 * 1024 }).expect(400);
  });

  test('file download URL: PDFs via the signed API download (works with PDF delivery blocked), images via secure_url', async () => {
    const t = await ctx.signIn('owner', 'owner@example.com');
    const auth = { Authorization: `Bearer ${t.accessToken}` };
    const asgId = uuidv7();
    const pdf = { ...base(uuidv7()), ownerType: 'assignment', ownerId: asgId, name: 'Lab 1.pdf', mime: 'application/pdf', size: 1000, provider: 'cloudinary', remoteId: 'duely/Fall 2026/PL-SQL/att9.pdf', remoteUrl: 'https://res.cloudinary.com/ownercloud/raw/upload/v17/duely/Fall%202026/PL-SQL/att9.pdf', checksum: 'x' };
    const img = { ...base(uuidv7()), ownerType: 'assignment', ownerId: asgId, name: 'board.jpg', mime: 'image/jpeg', size: 10, provider: 'cloudinary', remoteId: 'duely/att10', remoteUrl: 'https://res.cloudinary.com/ownercloud/image/upload/v17/duely/att10.jpg', checksum: 'y' };
    const pending = { ...base(uuidv7()), ownerType: 'assignment', ownerId: asgId, name: 'notyet.pdf', mime: 'application/pdf', size: 10, provider: 'cloudinary', remoteId: null, checksum: 'z' };
    await ctx.http().post('/sync/push').set(auth).send({ changes: [pdf, img, pending].map((record) => ({ table: 'files', record })) }).expect(200);

    const r = await ctx.http().get(`/files/${pdf.id}/url`).set(auth).expect(200);
    const u = new URL(r.body.url);
    expect(u.origin + u.pathname).toBe('https://api.cloudinary.com/v1_1/ownercloud/raw/download');
    expect(u.searchParams.get('public_id')).toBe('duely/Fall 2026/PL-SQL/att9.pdf');
    expect(u.searchParams.get('api_key')).toBe('ownerkey');
    const ts = u.searchParams.get('timestamp')!;
    const expected = cloudinarySignature({ public_id: 'duely/Fall 2026/PL-SQL/att9.pdf', type: 'upload', timestamp: ts, expires_at: u.searchParams.get('expires_at')! }, 'ownersecret');
    expect(u.searchParams.get('signature')).toBe(expected);
    expect(r.body.fallbackUrl).toBe(pdf.remoteUrl);
    expect(JSON.stringify(r.body)).not.toContain('ownersecret');

    const ri = await ctx.http().get(`/files/${img.id}/url`).set(auth).expect(200);
    expect(ri.body.url).toBe(img.remoteUrl);
    await ctx.http().get(`/files/${pending.id}/url`).set(auth).expect(404);
    const other = await ctx.signIn('stranger2');
    await ctx.http().get(`/files/${pdf.id}/url`).set('Authorization', `Bearer ${other.accessToken}`).expect(404);
  });

  test('non-owner without config cannot sign; owner-only option is forbidden', async () => {
    const t = await ctx.signIn('stranger');
    const auth = { Authorization: `Bearer ${t.accessToken}` };
    const info = await ctx.http().get('/storage').set(auth).expect(200);
    expect(info.body.provider).toBeNull();
    await ctx.http().post('/files/sign').set(auth).send({ attachmentId: 'a', resourceType: 'raw', mime: 'application/pdf', size: 10 }).expect(400);
    await ctx.http().put('/storage').set(auth).send({ provider: 'cloudinary', useOwner: true, pdfDeliveryConfirmed: true }).expect(403);
    await ctx.http().put('/storage').set(auth).send({ provider: 'gdrive' }).expect(400);
  });
});

describe('export (v2)', () => {
  test('reminders export lists assignments + subtasks of active courses, ack is monotonic', async () => {
    const t = await ctx.signIn('x1');
    const auth = { Authorization: `Bearer ${t.accessToken}` };
    const user = await UserModel.findById(t.userId).lean();
    const sem = semester();
    const c = course(uuidv7(), sem.id);
    const a = assignment(uuidv7(), c.id, sem.id, Date.now(), { dueAt: zonedTime(user!.timezone, 2026, 11, 13, 17, 0) });
    const sub = { ...base(uuidv7()), assignmentId: a.id, title: 'Part 1', done: true, order: 0 };
    await ctx.http().post('/sync/push').set(auth).send({ changes: [{ table: 'courses', record: c }, { table: 'assignments', record: a }, { table: 'subtasks', record: sub }] });
    const r = await ctx.http().get('/export/reminders?since=0').set(auth).expect(200);
    expect(r.body.items).toHaveLength(2);
    expect(r.body.items[0].title).toBe('PL/SQL — Lab on cursors');
    expect(r.body.items[0].notes).toMatch(/^Due 17:00/);
    expect(r.body.items[1]).toMatchObject({ parentId: a.id, completed: true });
    await ctx.http().post('/export/reminders/ack').set(auth).send({ rev: 3 }).expect(200);
    await ctx.http().post('/export/reminders/ack').set(auth).send({ rev: 1 }).expect(200);
    const r2 = await ctx.http().get('/export/reminders?since=3').set(auth).expect(200);
    expect(r2.body.ackedRev).toBe(3);
    expect(r2.body.items).toHaveLength(0);
  });
});

describe('access requests, feedback, admin', () => {
  test('anyone can request access; repeats are merged; admins are emailed once', async () => {
    ctx.mail.sent.length = 0;
    await ctx.http().post('/access-requests').send({ email: ' New.Person@Gmail.com ', name: 'New Person' }).expect(202);
    await ctx.http().post('/access-requests').send({ email: 'new.person@gmail.com' }).expect(202);
    await ctx.http().post('/access-requests').send({ email: 'not-an-email' }).expect(400);
    expect(ctx.mail.sent.map((m) => m.to)).toEqual(['owner@example.com']);
    expect(ctx.mail.sent[0]!.subject).toContain('new.person@gmail.com');
  });

  test('admin endpoints are owner-only; owner sees isAdmin', async () => {
    const bob = await ctx.signIn('bob-admin-test', 'bob@example.com');
    await ctx.http().get('/admin/access-requests').set('Authorization', `Bearer ${bob.accessToken}`).expect(403);
    const me = await ctx.http().get('/me').set('Authorization', `Bearer ${bob.accessToken}`).expect(200);
    expect(me.body.user.isAdmin).toBe(false);
    const owner = await ctx.signIn('owner-sub', 'owner@example.com');
    const meO = await ctx.http().get('/me').set('Authorization', `Bearer ${owner.accessToken}`).expect(200);
    expect(meO.body.user.isAdmin).toBe(true);
  });

  test('admin lists requests, notifies by email, and handles missing SMTP', async () => {
    const owner = await ctx.signIn('owner-sub', 'owner@example.com');
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const list = await ctx.http().get('/admin/access-requests').set(auth).expect(200);
    const req = list.body.find((r: { email: string }) => r.email === 'new.person@gmail.com');
    expect(req).toMatchObject({ status: 'pending', requests: 2, name: 'New Person' });

    ctx.mail.sent.length = 0;
    const n = await ctx.http().post(`/admin/access-requests/${req.id}/notify`).set(auth).expect(200);
    expect(n.body).toMatchObject({ status: 'notified' });
    expect(n.body.notifiedAt).toBeGreaterThan(0);
    expect(ctx.mail.sent).toHaveLength(1);
    expect(ctx.mail.sent[0]).toMatchObject({ to: 'new.person@gmail.com', subject: "You're in — sign in to Duely" });
    expect(ctx.mail.sent[0]!.html).toContain('Hi New');

    ctx.mail.configured = false;
    await ctx.http().post(`/admin/access-requests/${req.id}/notify`).set(auth).expect(503);
    ctx.mail.configured = true;

    await ctx.http().patch(`/admin/access-requests/${req.id}`).set(auth).send({ status: 'dismissed' }).expect(200);
    const s = await ctx.http().get('/admin/summary').set(auth).expect(200);
    expect(s.body).toMatchObject({ emailConfigured: true });
  });

  test('signed-in users send feedback; admin reads and marks it read', async () => {
    const alice = await ctx.signIn('alice-fb', 'alice-fb@example.com');
    await ctx.http().post('/feedback').set('Authorization', `Bearer ${alice.accessToken}`).send({ kind: 'bug', message: 'x' }).expect(400);
    await ctx.http()
      .post('/feedback')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ kind: 'bug', message: 'Calendar tab closes the app', appVersion: '1.0.0', device: 'android 15' })
      .expect(201);
    await ctx.http().post('/feedback').send({ kind: 'idea', message: 'no token' }).expect(401);

    const owner = await ctx.signIn('owner-sub', 'owner@example.com');
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const fb = await ctx.http().get('/admin/feedback').set(auth).expect(200);
    expect(fb.body[0]).toMatchObject({ kind: 'bug', message: 'Calendar tab closes the app', email: 'alice-fb@example.com', read: false });
    await ctx.http().patch(`/admin/feedback/${fb.body[0].id}`).set(auth).send({ read: true }).expect(204);
    const s = await ctx.http().get('/admin/summary').set(auth).expect(200);
    expect(s.body.unreadFeedback).toBe(0);
  });

  test('Google refusing the code (not a test user) becomes code google_access_denied', () => {
    const err = googleCodeError({ response: { data: { error: 'access_denied' } } }) as ForbiddenException;
    expect(err.getStatus()).toBe(403);
    expect(err.getResponse()).toMatchObject({ code: 'google_access_denied' });
    expect((googleCodeError({ response: { data: { error: 'invalid_grant' } } }) as BadGatewayException).getStatus()).toBe(502);
  });
});

describe('shares', () => {
  test('owner shares an assignment; a friend reads the snapshot; landing page is public; others cannot share it', async () => {
    const a = await ctx.signIn('share-a', 'ann@example.com');
    const authA = { Authorization: `Bearer ${a.accessToken}` };
    const sem = semester();
    const c = course(uuidv7(), sem.id);
    const asg = assignment(uuidv7(), c.id, sem.id, Date.now(), {
      kind: 'group',
      group: { members: [{ name: 'Me', isMe: true }, { name: 'Kim', isMe: false }], myPart: 'Slides', meetings: [], chatLink: null },
    });
    await ctx.http().post('/sync/push').set(authA).send({ changes: [{ table: 'semesters', record: sem }, { table: 'courses', record: c }, { table: 'assignments', record: asg }] }).expect(200);

    const created = await ctx.http().post('/shares').set(authA).send({ kind: 'assignment', id: asg.id }).expect(201);
    expect(created.body.url).toMatch(/\/s\/[A-Za-z0-9_-]+$/);
    const again = await ctx.http().post('/shares').set(authA).send({ kind: 'assignment', id: asg.id }).expect(201);
    expect(again.body.token).toBe(created.body.token);

    const b = await ctx.signIn('share-b', 'ben@example.com');
    const authB = { Authorization: `Bearer ${b.accessToken}` };
    // Ben can't share Ann's assignment by id (scoped by userId).
    await ctx.http().post('/shares').set(authB).send({ kind: 'assignment', id: asg.id }).expect(404);
    const got = await ctx.http().get(`/shares/${created.body.token}`).set(authB).expect(200);
    expect(got.body).toMatchObject({ kind: 'assignment', course: { shortName: c.shortName }, assignment: { title: asg.title, kind: 'group' } });
    expect(got.body.assignment.group.myPart).toBeNull();
    expect(got.body.assignment.group.members.every((m: { isMe: boolean }) => !m.isMe)).toBe(true);
    expect(JSON.stringify(got.body)).not.toContain('ann@example.com');

    await ctx.http().get(`/shares/${created.body.token}`).expect(401);
    await ctx.http().get('/shares/nope!').set(authB).expect(404);
    const page = await ctx.http().get(`/s/${created.body.token}`).expect(200);
    expect(page.text).toContain(`duely://share/${created.body.token}`);
    expect(page.text).not.toContain(asg.title);
  });
});
