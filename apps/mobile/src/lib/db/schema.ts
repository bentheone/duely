import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ClassSlot, GroupInfo, LectureBlock, SyncTable } from '@duely/shared';

/** Local mirror of §5 (flattened JSON columns for nested values) + outbox/sync_meta/file_cache (§5.2). */
const base = {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  createdAt: integer('createdAt').notNull(),
  updatedAt: integer('updatedAt').notNull(),
  deletedAt: integer('deletedAt'),
  rev: integer('rev').notNull().default(0),
};

export const semesters = sqliteTable('semesters', {
  ...base,
  name: text('name').notNull(),
  startsOn: text('startsOn').notNull(),
  endsOn: text('endsOn').notNull(),
  status: text('status', { enum: ['active', 'archived'] }).notNull(),
});

export const courses = sqliteTable('courses', {
  ...base,
  semesterId: text('semesterId').notNull(),
  code: text('code').notNull(),
  title: text('title').notNull(),
  shortName: text('shortName').notNull(),
  color: text('color').notNull(),
  lecturer: text('lecturer'),
  room: text('room'),
  group: text('group'),
  status: text('status', { enum: ['active', 'finished'] }).notNull(),
  finishedAt: integer('finishedAt'),
  matchRules: text('matchRules', { mode: 'json' }).$type<string[]>().notNull(),
  schedule: text('schedule', { mode: 'json' }).$type<ClassSlot[] | null>(),
  scheduleToGoogle: integer('scheduleToGoogle', { mode: 'boolean' }),
  scheduleRev: integer('scheduleRev'),
  scheduleGoogleEventIds: text('scheduleGoogleEventIds', { mode: 'json' }).$type<string[] | null>(),
  scheduleGoogleHash: text('scheduleGoogleHash'),
});

export const classSessions = sqliteTable('classSessions', {
  ...base,
  courseId: text('courseId').notNull(),
  googleEventId: text('googleEventId').notNull(),
  start: integer('start').notNull(),
  end: integer('end').notNull(),
  room: text('room'),
  sourceCalendarId: text('sourceCalendarId').notNull(),
});

export const assignments = sqliteTable('assignments', {
  ...base,
  courseId: text('courseId').notNull(),
  semesterId: text('semesterId').notNull(),
  title: text('title').notNull(),
  notes: text('notes').notNull(),
  links: text('links', { mode: 'json' }).$type<{ title: string; url: string }[]>().notNull(),
  dueAt: integer('dueAt'),
  kind: text('kind', { enum: ['individual', 'group'] }).notNull(),
  submission: text('submission', { enum: ['moodle', 'email', 'printed', 'in_class', 'other'] }).notNull(),
  marks: real('marks'),
  status: text('status', { enum: ['not_started', 'in_progress', 'done', 'submitted', 'graded'] }).notNull(),
  grade: text('grade'),
  progressMode: text('progressMode', { enum: ['auto', 'manual'] }).notNull(),
  progressManual: real('progressManual'),
  group: text('group', { mode: 'json' }).$type<GroupInfo | null>(),
  reminderOffsets: text('reminderOffsets', { mode: 'json' }).$type<string[] | null>(),
  keepOffline: integer('keepOffline', { mode: 'boolean' }),
  googleTaskId: text('googleTaskId'),
});

export const subtasks = sqliteTable('subtasks', {
  ...base,
  assignmentId: text('assignmentId').notNull(),
  title: text('title').notNull(),
  dueAt: integer('dueAt'),
  done: integer('done', { mode: 'boolean' }).notNull(),
  order: real('order').notNull(),
  googleTaskId: text('googleTaskId'),
});

export const exams = sqliteTable('exams', {
  ...base,
  courseId: text('courseId').notNull(),
  semesterId: text('semesterId').notNull(),
  type: text('type', { enum: ['quiz', 'cat', 'midterm', 'final', 'other'] }).notNull(),
  startsAt: integer('startsAt').notNull(),
  durationMin: integer('durationMin'),
  room: text('room'),
  topics: text('topics', { mode: 'json' }).$type<{ id: string; title: string; done: boolean }[]>().notNull(),
  notes: text('notes').notNull(),
});

export const sessions = sqliteTable('sessions', {
  ...base,
  kind: text('kind', { enum: ['work', 'study'] }).notNull(),
  assignmentId: text('assignmentId'),
  examId: text('examId'),
  title: text('title').notNull(),
  start: integer('start').notNull(),
  end: integer('end').notNull(),
  status: text('status', { enum: ['suggested', 'confirmed', 'done', 'skipped'] }).notNull(),
  googleEventId: text('googleEventId'),
});

export const files = sqliteTable('files', {
  ...base,
  ownerType: text('ownerType', { enum: ['assignment', 'exam', 'lecture'] }).notNull(),
  ownerId: text('ownerId').notNull(),
  name: text('name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  provider: text('provider', { enum: ['cloudinary', 'gdrive'] }).notNull(),
  remoteId: text('remoteId'),
  remoteUrl: text('remoteUrl'),
  checksum: text('checksum').notNull(),
});

export const missedChecks = sqliteTable('missedChecks', {
  ...base,
  courseId: text('courseId').notNull(),
  classSessionId: text('classSessionId'),
  answer: text('answer', { enum: ['added', 'none', 'later'] }).notNull(),
  at: integer('at').notNull(),
});

export const lectures = sqliteTable('lectures', {
  ...base,
  courseId: text('courseId').notNull(),
  semesterId: text('semesterId').notNull(),
  classSessionId: text('classSessionId'),
  at: integer('at').notNull(),
  title: text('title').notNull(),
  topics: text('topics', { mode: 'json' }).$type<string[]>().notNull(),
  blocks: text('blocks', { mode: 'json' }).$type<LectureBlock[]>().notNull(),
  recappedAt: integer('recappedAt'),
});

export const outbox = sqliteTable('outbox', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  table: text('table').notNull(),
  recordId: text('recordId').notNull(),
  op: text('op', { enum: ['upsert'] }).notNull(),
  payload: text('payload').notNull(),
  createdAt: integer('createdAt').notNull(),
  attempts: integer('attempts').notNull().default(0),
});

export const syncMeta = sqliteTable('sync_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const fileCache = sqliteTable('file_cache', {
  attachmentId: text('attachmentId').primaryKey(),
  localUri: text('localUri').notNull(),
  safUri: text('safUri'),
  downloadedAt: integer('downloadedAt').notNull(),
});

export const TABLES = {
  semesters,
  courses,
  classSessions,
  assignments,
  subtasks,
  exams,
  sessions,
  files,
  missedChecks,
  lectures,
} satisfies Record<SyncTable, unknown>;

/** Hand-written DDL (kept in step with the Drizzle tables above). Bump DB_VERSION + add a migration on change. */
const B = `id TEXT PRIMARY KEY NOT NULL, userId TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, deletedAt INTEGER, rev INTEGER NOT NULL DEFAULT 0`;
export const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS semesters (${B}, name TEXT NOT NULL, startsOn TEXT NOT NULL, endsOn TEXT NOT NULL, status TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS courses (${B}, semesterId TEXT NOT NULL, code TEXT NOT NULL, title TEXT NOT NULL, shortName TEXT NOT NULL, color TEXT NOT NULL, lecturer TEXT, room TEXT, "group" TEXT, status TEXT NOT NULL, finishedAt INTEGER, matchRules TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS classSessions (${B}, courseId TEXT NOT NULL, googleEventId TEXT NOT NULL, start INTEGER NOT NULL, "end" INTEGER NOT NULL, room TEXT, sourceCalendarId TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_class_start ON classSessions(start)`,
    `CREATE TABLE IF NOT EXISTS assignments (${B}, courseId TEXT NOT NULL, semesterId TEXT NOT NULL, title TEXT NOT NULL, notes TEXT NOT NULL, links TEXT NOT NULL, dueAt INTEGER, kind TEXT NOT NULL, submission TEXT NOT NULL, marks REAL, status TEXT NOT NULL, grade TEXT, progressMode TEXT NOT NULL, progressManual REAL, "group" TEXT, reminderOffsets TEXT, keepOffline INTEGER, googleTaskId TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_asg_due ON assignments(dueAt)`,
    `CREATE TABLE IF NOT EXISTS subtasks (${B}, assignmentId TEXT NOT NULL, title TEXT NOT NULL, dueAt INTEGER, done INTEGER NOT NULL, "order" REAL NOT NULL, googleTaskId TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_sub_asg ON subtasks(assignmentId)`,
    `CREATE TABLE IF NOT EXISTS exams (${B}, courseId TEXT NOT NULL, semesterId TEXT NOT NULL, type TEXT NOT NULL, startsAt INTEGER NOT NULL, durationMin INTEGER, room TEXT, topics TEXT NOT NULL, notes TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sessions (${B}, kind TEXT NOT NULL, assignmentId TEXT, examId TEXT, title TEXT NOT NULL, start INTEGER NOT NULL, "end" INTEGER NOT NULL, status TEXT NOT NULL, googleEventId TEXT)`,
    `CREATE TABLE IF NOT EXISTS files (${B}, ownerType TEXT NOT NULL, ownerId TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, provider TEXT NOT NULL, remoteId TEXT, remoteUrl TEXT, checksum TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS missedChecks (${B}, courseId TEXT NOT NULL, classSessionId TEXT, answer TEXT NOT NULL, at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, "table" TEXT NOT NULL, recordId TEXT NOT NULL, op TEXT NOT NULL, payload TEXT NOT NULL, createdAt INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_record ON outbox("table", recordId)`,
    `CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS file_cache (attachmentId TEXT PRIMARY KEY NOT NULL, localUri TEXT NOT NULL, safUri TEXT, downloadedAt INTEGER NOT NULL)`,
  ],
  // v2: lectures + course class times.
  [
    `ALTER TABLE courses ADD COLUMN schedule TEXT`,
    `ALTER TABLE courses ADD COLUMN scheduleToGoogle INTEGER`,
    `ALTER TABLE courses ADD COLUMN scheduleRev INTEGER`,
    `ALTER TABLE courses ADD COLUMN scheduleGoogleEventIds TEXT`,
    `ALTER TABLE courses ADD COLUMN scheduleGoogleHash TEXT`,
    `CREATE TABLE IF NOT EXISTS lectures (${B}, courseId TEXT NOT NULL, semesterId TEXT NOT NULL, classSessionId TEXT, at INTEGER NOT NULL, title TEXT NOT NULL, topics TEXT NOT NULL, blocks TEXT NOT NULL, recappedAt INTEGER)`,
    `CREATE INDEX IF NOT EXISTS idx_lecture_course ON lectures(courseId, at)`,
  ],
];
