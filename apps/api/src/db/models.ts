import mongoose, { Schema, type Model } from 'mongoose';
import { DEFAULT_SETTINGS, DEFAULT_TIMEZONE, type SyncTable } from '@duely/shared';

/**
 * Mongoose models (§5.1). Every document's `_id` is the client-generated UUID v7 string;
 * `toRecord()` maps it back to `id` for the wire.
 */
const { Mixed } = Schema.Types;

type AnyDoc = Record<string, unknown>;

function syncSchema(fields: Record<string, unknown>): Schema<AnyDoc> {
  const s = new Schema<AnyDoc>(
    {
      _id: { type: String, required: true },
      userId: { type: String, required: true, index: true },
      createdAt: { type: Number, required: true },
      updatedAt: { type: Number, required: true },
      deletedAt: { type: Number, default: null },
      rev: { type: Number, required: true },
      ...fields,
    } as Record<string, unknown>,
    { versionKey: false, minimize: false },
  );
  s.index({ userId: 1, rev: 1 });
  return s;
}

function model<T = AnyDoc>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as unknown as Model<T>) ?? (mongoose.model<T>(name, schema as never) as unknown as Model<T>);
}

// ---- Server-only collections ----

export interface UserDoc {
  _id: string;
  googleSub: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  timezone: string;
  settings: typeof DEFAULT_SETTINGS;
  activeSemesterId?: string | null;
  createdAt: number;
  updatedAt: number;
}
export const UserModel = model<UserDoc>(
  'User',
  new Schema<UserDoc>(
    {
      _id: { type: String, required: true },
      googleSub: { type: String, required: true, unique: true },
      email: { type: String, required: true },
      name: { type: String, default: '' },
      avatarUrl: { type: String, default: null },
      timezone: { type: String, default: DEFAULT_TIMEZONE },
      settings: { type: Mixed, default: () => structuredClone(DEFAULT_SETTINGS) },
      activeSemesterId: { type: String, default: null },
      createdAt: Number,
      updatedAt: Number,
    },
    { versionKey: false, minimize: false },
  ),
);

export interface IntegrationAccountDoc {
  _id: string;
  userId: string;
  provider: 'google';
  refreshTokenEnc?: string | null;
  scopes: string[];
  timetableCalendarIds: string[];
  busyCalendarIds: string[];
  duelyCalendarId?: string | null;
  duelyCalendarSyncToken?: string | null;
  tasksListId?: string | null;
  driveFolderId?: string | null;
  lastSyncAt?: number | null;
  calendarsConfigured: boolean;
}
export const IntegrationAccountModel = model<IntegrationAccountDoc>(
  'IntegrationAccount',
  new Schema<IntegrationAccountDoc>(
    {
      _id: { type: String, required: true },
      userId: { type: String, required: true, unique: true },
      provider: { type: String, default: 'google' },
      refreshTokenEnc: { type: String, default: null },
      scopes: { type: [String], default: [] },
      timetableCalendarIds: { type: [String], default: [] },
      busyCalendarIds: { type: [String], default: [] },
      duelyCalendarId: { type: String, default: null },
      duelyCalendarSyncToken: { type: String, default: null },
      tasksListId: { type: String, default: null },
      driveFolderId: { type: String, default: null },
      lastSyncAt: { type: Number, default: null },
      calendarsConfigured: { type: Boolean, default: false },
    },
    { versionKey: false },
  ),
);

export interface StorageConfigDoc {
  _id: string;
  userId: string;
  provider: 'cloudinary' | 'gdrive';
  useOwner: boolean;
  cloudinary?: { cloudName: string; apiKey: string; apiSecretEnc: string; folder: string } | null;
  pdfDeliveryConfirmed: boolean;
}
export const StorageConfigModel = model<StorageConfigDoc>(
  'StorageConfig',
  new Schema<StorageConfigDoc>(
    {
      _id: { type: String, required: true },
      userId: { type: String, required: true, unique: true },
      provider: { type: String, required: true },
      useOwner: { type: Boolean, default: false },
      cloudinary: { type: Mixed, default: null },
      pdfDeliveryConfirmed: { type: Boolean, default: false },
    },
    { versionKey: false },
  ),
);

export interface RefreshTokenDoc {
  _id: string; // jti
  userId: string;
  family: string;
  expiresAt: Date;
  usedAt?: number | null;
  revokedAt?: number | null;
}
const refreshSchema = new Schema<RefreshTokenDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Number, default: null },
    revokedAt: { type: Number, default: null },
  },
  { versionKey: false },
);
refreshSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RefreshTokenModel = model<RefreshTokenDoc>('RefreshToken', refreshSchema);

export interface ApiTokenDoc {
  _id: string;
  userId: string;
  name: string;
  hash: string;
  prefix: string;
  createdAt: number;
  lastUsedAt?: number | null;
  revokedAt?: number | null;
}
export const ApiTokenModel = model<ApiTokenDoc>(
  'ApiToken',
  new Schema<ApiTokenDoc>(
    {
      _id: { type: String, required: true },
      userId: { type: String, required: true, index: true },
      name: { type: String, required: true },
      hash: { type: String, required: true, unique: true },
      prefix: String,
      createdAt: Number,
      lastUsedAt: { type: Number, default: null },
      revokedAt: { type: Number, default: null },
    },
    { versionKey: false },
  ),
);

export interface CounterDoc {
  _id: string; // userId
  rev: number;
  exportAckedRev?: number;
}
export const CounterModel = model<CounterDoc>(
  'Counter',
  new Schema<CounterDoc>(
    { _id: String, rev: { type: Number, default: 0 }, exportAckedRev: { type: Number, default: 0 } },
    { versionKey: false },
  ),
);

// ---- Access requests & feedback (not synced; admin-only reads) ----

export interface AccessRequestDoc {
  _id: string;
  email: string;
  name?: string | null;
  status: 'pending' | 'added' | 'notified' | 'dismissed';
  requests: number;
  createdAt: number;
  updatedAt: number;
  notifiedAt?: number | null;
}
export const AccessRequestModel = model<AccessRequestDoc>(
  'AccessRequest',
  new Schema<AccessRequestDoc>(
    {
      _id: { type: String, required: true },
      email: { type: String, required: true, unique: true },
      name: { type: String, default: null },
      status: { type: String, required: true, default: 'pending', index: true },
      requests: { type: Number, default: 1 },
      createdAt: Number,
      updatedAt: Number,
      notifiedAt: { type: Number, default: null },
    },
    { versionKey: false },
  ),
);

export interface FeedbackDoc {
  _id: string;
  userId: string;
  kind: 'bug' | 'idea' | 'other';
  message: string;
  appVersion?: string | null;
  device?: string | null;
  read: boolean;
  createdAt: number;
}
export const FeedbackModel = model<FeedbackDoc>(
  'Feedback',
  new Schema<FeedbackDoc>(
    {
      _id: { type: String, required: true },
      userId: { type: String, required: true, index: true },
      kind: { type: String, required: true },
      message: { type: String, required: true },
      appVersion: { type: String, default: null },
      device: { type: String, default: null },
      read: { type: Boolean, default: false },
      createdAt: { type: Number, index: true },
    },
    { versionKey: false },
  ),
);

// ---- Synced collections ----

export const SemesterModel = model(
  'Semester',
  syncSchema({ name: String, startsOn: String, endsOn: String, status: String }),
);
export const CourseModel = model(
  'Course',
  syncSchema({
    semesterId: String, code: String, title: String, shortName: String, color: String,
    lecturer: String, room: String, group: String, status: String, finishedAt: Number,
    matchRules: [String],
    schedule: Mixed, scheduleToGoogle: Boolean, scheduleRev: Number,
    scheduleGoogleEventIds: [String], scheduleGoogleHash: String,
  }),
);
const classSessionSchema = syncSchema({
  courseId: String, googleEventId: String, start: Number, end: Number, room: String, sourceCalendarId: String,
});
classSessionSchema.index({ userId: 1, googleEventId: 1 });
export const ClassSessionModel = model('ClassSession', classSessionSchema);
export const AssignmentModel = model(
  'Assignment',
  syncSchema({
    courseId: String, semesterId: String, title: String, notes: String, links: Mixed, dueAt: Number,
    kind: String, submission: String, marks: Number, status: String, grade: String,
    progressMode: String, progressManual: Number, group: Mixed, reminderOffsets: Mixed,
    keepOffline: Boolean, googleTaskId: { type: String, index: true },
  }),
);
export const SubtaskModel = model(
  'Subtask',
  syncSchema({
    assignmentId: { type: String, index: true }, title: String, dueAt: Number, done: Boolean, order: Number,
    googleTaskId: { type: String, index: true },
  }),
);
export const ExamModel = model(
  'Exam',
  syncSchema({
    courseId: String, semesterId: String, type: String, startsAt: Number, durationMin: Number,
    room: String, topics: Mixed, notes: String,
  }),
);
export const SessionModel = model(
  'Session',
  syncSchema({
    kind: String, assignmentId: String, examId: String, title: String, start: Number, end: Number,
    status: String, googleEventId: String,
  }),
);
export const FileAttachmentModel = model(
  'FileAttachment',
  syncSchema({
    ownerType: String, ownerId: String, name: String, mime: String, size: Number, provider: String,
    remoteId: String, remoteUrl: String, checksum: String,
  }),
);
export const MissedCheckLogModel = model(
  'MissedCheckLog',
  syncSchema({ courseId: String, classSessionId: String, answer: String, at: Number }),
);

export const LectureModel = model(
  'Lecture',
  syncSchema({
    courseId: String, semesterId: String, classSessionId: String, at: Number, title: String,
    topics: [String], blocks: Mixed, recappedAt: Number,
  }),
);

export const TABLE_MODELS: Record<SyncTable, Model<Record<string, unknown>>> = {
  semesters: SemesterModel,
  courses: CourseModel,
  classSessions: ClassSessionModel,
  assignments: AssignmentModel,
  subtasks: SubtaskModel,
  exams: ExamModel,
  sessions: SessionModel,
  files: FileAttachmentModel,
  missedChecks: MissedCheckLogModel,
  lectures: LectureModel,
};

/** Server-managed link fields that a stale client push must not clear. */
export const SERVER_MANAGED_FIELDS: Partial<Record<SyncTable, string[]>> = {
  courses: ['scheduleGoogleEventIds', 'scheduleGoogleHash'],
  assignments: ['googleTaskId'],
  subtasks: ['googleTaskId'],
  sessions: ['googleEventId'],
};

export function toRecord<T = Record<string, unknown>>(doc: Record<string, unknown> | null): T | null {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as T;
}

/** Atomically reserves `n` consecutive revs for a user; returns the first. */
export async function reserveRevs(userId: string, n: number): Promise<number> {
  const c = await CounterModel.findOneAndUpdate(
    { _id: userId },
    { $inc: { rev: n } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  return c!.rev - n + 1;
}

export async function currentRev(userId: string): Promise<number> {
  const c = await CounterModel.findById(userId).lean();
  return c?.rev ?? 0;
}

/** Server-side write to a synced record (Google sync etc.): bumps rev + updatedAt. */
export async function serverUpdate(
  table: SyncTable,
  userId: string,
  id: string,
  set: Record<string, unknown>,
): Promise<void> {
  const rev = await reserveRevs(userId, 1);
  await TABLE_MODELS[table].updateOne({ _id: id, userId }, { $set: { ...set, rev, updatedAt: Date.now() } });
}

export async function serverInsert(
  table: SyncTable,
  userId: string,
  record: Record<string, unknown> & { id: string },
): Promise<void> {
  const rev = await reserveRevs(userId, 1);
  const now = Date.now();
  const { id, ...rest } = record;
  await TABLE_MODELS[table].create({ createdAt: now, deletedAt: null, ...rest, _id: id, userId, rev, updatedAt: now });
}

// ---- Shares (assignment / exam snapshots sent to a friend) ----
export interface ShareDoc {
  _id: string; // random token
  userId: string;
  kind: 'assignment' | 'exam' | 'lecture';
  itemId: string;
  payload: Record<string, unknown>;
  opens: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: Date;
}
const shareSchema = new Schema<ShareDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    kind: { type: String, required: true },
    itemId: { type: String, required: true },
    payload: { type: Mixed, required: true },
    opens: { type: Number, default: 0 },
    createdAt: Number,
    updatedAt: Number,
    // TTL: links stop working after 90 days.
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { versionKey: false, minimize: false },
);
shareSchema.index({ userId: 1, kind: 1, itemId: 1 });
export const ShareModel = model<ShareDoc>('Share', shareSchema);

// ---- Course communities ----
export interface CommunityDoc {
  _id: string;
  name: string;
  course: { code: string; shortName: string; title: string; color: string };
  ownerId: string;
  members: { userId: string; role: 'owner' | 'member'; joinedAt: number }[];
  inviteToken: string;
  createdAt: number;
  updatedAt: number;
  lastPostAt?: number | null;
  deletedAt?: number | null;
}
const communitySchema = new Schema<CommunityDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    course: { type: Mixed, required: true },
    ownerId: { type: String, required: true },
    members: { type: [{ userId: String, role: String, joinedAt: Number, _id: false }], default: [] },
    inviteToken: { type: String, required: true, unique: true },
    createdAt: Number,
    updatedAt: Number,
    lastPostAt: { type: Number, default: null },
    deletedAt: { type: Number, default: null },
  },
  { versionKey: false, minimize: false },
);
communitySchema.index({ 'members.userId': 1 });
export const CommunityModel = model<CommunityDoc>('Community', communitySchema);

export interface CommunityPostDoc {
  _id: string;
  communityId: string;
  authorId: string;
  kind: string;
  itemId?: string | null;
  payload: Record<string, unknown>;
  createdAt: number;
  deletedAt?: number | null;
}
const postSchema = new Schema<CommunityPostDoc>(
  {
    _id: { type: String, required: true },
    communityId: { type: String, required: true },
    authorId: { type: String, required: true },
    kind: { type: String, required: true },
    itemId: { type: String, default: null },
    payload: { type: Mixed, required: true },
    createdAt: Number,
    deletedAt: { type: Number, default: null },
  },
  { versionKey: false, minimize: false },
);
postSchema.index({ communityId: 1, createdAt: -1 });
export const CommunityPostModel = model<CommunityPostDoc>('CommunityPost', postSchema);
