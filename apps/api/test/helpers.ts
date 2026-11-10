import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import mongoose from 'mongoose';
import type { Interval } from '@duely/shared';
import { GOOGLE_API_FACTORY, type GEvent, type GoogleApi, type GTask } from '../src/google/google.client';
import { AppModule } from '../src/app.module';
import { GOOGLE_IDENTITY } from '../src/auth/google-identity';
import { configureApp } from '../src/serverless';

export interface FakeGoogle extends GoogleApi {
  calendars: { id: string; summary: string; primary: boolean }[];
  events: Map<string, GEvent[]>;
  tasks: Map<string, GTask & { listId: string }>;
  taskLists: { id: string; title: string }[];
  busy: Interval[];
  calls: string[];
}

export function fakeGoogle(): FakeGoogle {
  let n = 0;
  const nextId = (p: string) => `${p}${++n}`;
  const f: FakeGoogle = {
    calendars: [{ id: 'primary@x', summary: 'Me', primary: true }],
    events: new Map(),
    tasks: new Map(),
    taskLists: [],
    busy: [],
    calls: [],
    async listCalendars() {
      return f.calendars;
    },
    async createCalendar(summary) {
      const id = nextId('cal');
      f.calendars.push({ id, summary, primary: false });
      f.calls.push(`createCalendar:${summary}`);
      return id;
    },
    async listEvents(calId, min, max) {
      return (f.events.get(calId) ?? []).filter((e) => (e.start ?? 0) < max && (e.end ?? 0) > min);
    },
    async syncEvents(calId) {
      return { events: (f.events.get(calId) ?? []).filter((e) => e.status === 'cancelled' || e.duelySessionId), nextSyncToken: 'tok' };
    },
    async insertEvent(calId, ev) {
      const e = { ...ev, id: nextId('ev') };
      f.events.set(calId, [...(f.events.get(calId) ?? []), e]);
      f.calls.push(`insertEvent:${ev.summary}`);
      return e;
    },
    async patchEvent(calId, id, ev) {
      f.calls.push(`patchEvent:${id}`);
      return { id, ...ev };
    },
    async deleteEvent(calId, id) {
      f.calls.push(`deleteEvent:${id}`);
    },
    async freeBusy() {
      return f.busy;
    },
    async listTaskLists() {
      return f.taskLists;
    },
    async createTaskList(title) {
      const id = nextId('list');
      f.taskLists.push({ id, title });
      return id;
    },
    async listTasks(listId) {
      return [...f.tasks.values()].filter((t) => t.listId === listId);
    },
    async insertTask(listId, task, parent) {
      const t = { ...task, id: nextId('task'), parent: parent ?? null, listId, updated: new Date().toISOString() };
      f.tasks.set(t.id, t);
      f.calls.push(`insertTask:${task.title}`);
      return t;
    },
    async patchTask(listId, id, patch) {
      const t = f.tasks.get(id)!;
      Object.assign(t, patch, { updated: new Date().toISOString() });
      f.calls.push(`patchTask:${id}`);
      return t;
    },
    async deleteTask(_l, id) {
      f.tasks.delete(id);
    },
    async createDriveFolder() {
      return 'folder1';
    },
    async createResumableUpload() {
      return 'https://upload.example/session';
    },
    async accessToken() {
      return 'ya29.fake';
    },
  };
  return f;
}

export interface TestCtx {
  app: INestApplication;
  mongo: MongoMemoryServer;
  google: FakeGoogle;
  http: () => ReturnType<typeof request>;
  signIn: (sub?: string, email?: string) => Promise<{ accessToken: string; refreshToken: string; userId: string }>;
}

export async function setup(): Promise<TestCtx> {
  const mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  process.env.MONGODB_URI = mongo.getUri('duely');
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.GOOGLE_WEB_CLIENT_ID = 'web-client';
  process.env.OWNER_EMAIL = 'owner@example.com';
  process.env.OWNER_CLOUDINARY_CLOUD_NAME = 'ownercloud';
  process.env.OWNER_CLOUDINARY_API_KEY = 'ownerkey';
  process.env.OWNER_CLOUDINARY_API_SECRET = 'ownersecret';

  const google = fakeGoogle();

  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GOOGLE_IDENTITY)
    .useValue({
      verifyIdToken: async (t: string) => {
        const [, sub, email] = t.split(':');
        if (!sub) throw new Error('bad');
        return { sub, email: email ?? `${sub}@example.com`, name: sub };
      },
      exchangeCode: async () => ({
        refreshToken: 'google-refresh',
        scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/tasks'],
      }),
    })
    .overrideProvider(GOOGLE_API_FACTORY)
    .useValue({ forAccount: () => google })
    .compile();
  const app = configureApp(mod.createNestApplication({ logger: false }));
  await app.init();
  const http = () => request(app.getHttpServer());
  const signIn = async (sub = 'alice', email?: string) => {
    const r = await http()
      .post('/auth/google')
      .send({ idToken: `test-id-token:${sub}${email ? `:${email}` : ''}`, serverAuthCode: 'code-123' })
      .expect(200);
    return { accessToken: r.body.accessToken, refreshToken: r.body.refreshToken, userId: r.body.user.id };
  };
  return { app, mongo, google, http, signIn };
}

export async function teardown(ctx: TestCtx): Promise<void> {
  await ctx.app.close();
  await mongoose.disconnect();
  (globalThis as { __duelyMongo?: unknown }).__duelyMongo = undefined;
  await ctx.mongo.stop();
}

export function base(id: string, updatedAt = Date.now()) {
  return { id, createdAt: updatedAt, updatedAt, deletedAt: null };
}
