import { z } from 'zod';
import type { SyncTable } from './constants';

const id = z.string().min(1).max(64);
const ms = z.number().int().nonnegative();
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

/** Fields every synced document carries (§5). */
export const baseFields = {
  id,
  userId: z.string(),
  createdAt: ms,
  updatedAt: ms,
  deletedAt: ms.nullable(),
  rev: z.number().int().nonnegative(),
};

export const SettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  alarm: z.object({
    enabled: z.boolean(),
    leadMinutes: z.number().int().min(0).max(240),
    everyClass: z.boolean(),
    snoozeMinutes: z.number().int().min(1).max(60),
    ringOnSilent: z.boolean(),
  }),
  reminders: z.object({ dueOffsets: z.array(z.string()), morningTime: hhmm }),
  missedCheck: z.object({
    afterClass: z.boolean(),
    weekly: z.boolean(),
    weeklyDay: z.number().int().min(0).max(6),
    weeklyTime: hhmm,
    quietDays: z.number().int().min(1).max(60),
  }),
  workHours: z.object({ start: hhmm, end: hhmm }),
  sessionDefaultMinutes: z.number().int().min(15).max(480),
  communities: z.object({ notify: z.boolean() }).optional(),
  /** Optional: users created before lectures existed don't have it (defaults fill in). */
  lectures: z
    .object({
      logReminder: z.boolean(),
      recapReminder: z.boolean(),
      recapLeadMinutes: z.number().int().min(0).max(240),
    })
    .optional(),
});
export const SettingsPatchSchema = z
  .object({
    theme: SettingsSchema.shape.theme,
    alarm: SettingsSchema.shape.alarm.partial(),
    reminders: SettingsSchema.shape.reminders.partial(),
    missedCheck: SettingsSchema.shape.missedCheck.partial(),
    workHours: SettingsSchema.shape.workHours.partial(),
    sessionDefaultMinutes: SettingsSchema.shape.sessionDefaultMinutes,
    lectures: SettingsSchema.shape.lectures.unwrap().partial(),
    communities: SettingsSchema.shape.communities.unwrap().partial(),
    activeSemesterId: z.string().nullable(),
    timezone: z.string(),
  })
  .partial();

export const UserSchema = z.object({
  id,
  googleSub: z.string(),
  email: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable().optional(),
  timezone: z.string(),
  settings: SettingsSchema,
  activeSemesterId: z.string().nullable().optional(),
  /** Server-computed (ADMIN_EMAILS / OWNER_EMAIL); never client-writable. */
  isAdmin: z.boolean().optional(),
  /** Public handle shown to colleagues (lowercase, unique). */
  username: z.string().nullable().optional(),
});

export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
export const ProfilePatchSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => v.replace(/^@/, ''))
    .pipe(z.string().regex(USERNAME_RE, '3–20 letters, numbers, _ or .'))
    .nullable(),
});

export const SemesterSchema = z.object({
  ...baseFields,
  name: z.string().min(1).max(80),
  startsOn: z.string(),
  endsOn: z.string(),
  status: z.enum(['active', 'archived']),
});

export const ClassSlotSchema = z.object({
  weekday: z.number().int().min(0).max(6), // 0 = Sunday
  start: hhmm,
  end: hhmm,
  room: z.string().max(60).nullable().optional(),
});

export const CourseSchema = z.object({
  ...baseFields,
  semesterId: id,
  code: z.string().max(40),
  title: z.string().max(200),
  shortName: z.string().min(1).max(24),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  lecturer: z.string().max(120).nullable().optional(),
  room: z.string().max(60).nullable().optional(),
  group: z.string().max(20).nullable().optional(),
  status: z.enum(['active', 'finished']),
  finishedAt: ms.nullable().optional(),
  matchRules: z.array(z.string().max(80)).max(50),
  /** Weekly class times entered in Duely (the server turns them into class sessions). */
  schedule: z.array(ClassSlotSchema).max(14).nullable().optional(),
  /** Also put those class times on the user's Google Calendar ("Duely" calendar). */
  scheduleToGoogle: z.boolean().nullable().optional(),
  /** Bumped by "Resync calendar" to force the Google copy to be rebuilt. */
  scheduleRev: z.number().int().nonnegative().nullable().optional(),
  /** Server-managed: Google recurring event ids for the schedule + hash of what was written. */
  scheduleGoogleEventIds: z.array(z.string()).nullable().optional(),
  scheduleGoogleHash: z.string().nullable().optional(),
});

export const ClassSessionSchema = z.object({
  ...baseFields,
  courseId: id,
  googleEventId: z.string(),
  start: ms,
  end: ms,
  room: z.string().nullable().optional(),
  sourceCalendarId: z.string(),
});

export const LinkSchema = z.object({ title: z.string().max(200), url: z.string().max(2000) });
export const GroupMemberSchema = z.object({
  name: z.string().max(120),
  phone: z.string().max(40).nullable().optional(),
  whatsapp: z.string().max(40).nullable().optional(),
  isMe: z.boolean(),
});
export const GroupInfoSchema = z.object({
  members: z.array(GroupMemberSchema).max(30),
  myPart: z.string().max(2000).nullable().optional(),
  meetings: z.array(z.object({ at: ms, place: z.string().max(120).nullable().optional() })).max(50),
  chatLink: z.string().max(2000).nullable().optional(),
});

export const AssignmentStatus = z.enum(['not_started', 'in_progress', 'done', 'submitted', 'graded']);
export const Submission = z.enum(['moodle', 'email', 'printed', 'in_class', 'other']);

export const AssignmentSchema = z.object({
  ...baseFields,
  courseId: id,
  semesterId: id,
  title: z.string().min(1).max(300),
  notes: z.string().max(20000),
  links: z.array(LinkSchema).max(50),
  dueAt: ms.nullable(),
  kind: z.enum(['individual', 'group']),
  submission: Submission,
  marks: z.number().nullable().optional(),
  status: AssignmentStatus,
  grade: z.string().max(40).nullable().optional(),
  progressMode: z.enum(['auto', 'manual']),
  progressManual: z.number().min(0).max(100).nullable().optional(),
  group: GroupInfoSchema.nullable().optional(),
  reminderOffsets: z.array(z.string()).nullable().optional(),
  keepOffline: z.boolean().nullable().optional(),
  googleTaskId: z.string().nullable().optional(),
});

export const SubtaskSchema = z.object({
  ...baseFields,
  assignmentId: id,
  title: z.string().min(1).max(300),
  dueAt: ms.nullable().optional(),
  done: z.boolean(),
  order: z.number(),
  googleTaskId: z.string().nullable().optional(),
});

export const ExamType = z.enum(['quiz', 'cat', 'midterm', 'final', 'other']);
export const ExamSchema = z.object({
  ...baseFields,
  courseId: id,
  semesterId: id,
  type: ExamType,
  startsAt: ms,
  durationMin: z.number().int().positive().nullable().optional(),
  room: z.string().max(60).nullable().optional(),
  topics: z.array(z.object({ id, title: z.string().max(300), done: z.boolean() })).max(200),
  notes: z.string().max(20000),
});

export const SessionSchema = z.object({
  ...baseFields,
  kind: z.enum(['work', 'study']),
  assignmentId: id.nullable().optional(),
  examId: id.nullable().optional(),
  title: z.string().max(300),
  start: ms,
  end: ms,
  status: z.enum(['suggested', 'confirmed', 'done', 'skipped']),
  googleEventId: z.string().nullable().optional(),
});

export const FileAttachmentSchema = z.object({
  ...baseFields,
  ownerType: z.enum(['assignment', 'exam', 'lecture']),
  ownerId: id,
  name: z.string().min(1).max(255),
  mime: z.string().max(200),
  size: z.number().int().nonnegative(),
  provider: z.enum(['cloudinary', 'gdrive']),
  remoteId: z.string().nullable().optional(),
  remoteUrl: z.string().nullable().optional(),
  checksum: z.string().max(128),
});

export const MissedCheckLogSchema = z.object({
  ...baseFields,
  courseId: id,
  classSessionId: id.nullable().optional(),
  answer: z.enum(['added', 'none', 'later']),
  at: ms,
});

export const LECTURE_BLOCK_TYPES = ['p', 'h1', 'h2', 'bullet', 'number', 'check', 'quote', 'research', 'image', 'file', 'audio'] as const;
export const LectureBlockSchema = z.object({
  id,
  type: z.enum(LECTURE_BLOCK_TYPES),
  text: z.string().max(20000),
  done: z.boolean().nullable().optional(),
  /** image / file / audio blocks point at a FileAttachment (ownerType 'lecture'). */
  fileId: id.nullable().optional(),
  indent: z.number().int().min(0).max(3).nullable().optional(),
});

/** One logged lecture: main topics + a block document (headings, lists, images, files, voice). */
export const LectureSchema = z.object({
  ...baseFields,
  courseId: id,
  semesterId: id,
  classSessionId: id.nullable().optional(),
  at: ms,
  title: z.string().max(300),
  topics: z.array(z.string().max(200)).max(50),
  blocks: z.array(LectureBlockSchema).max(2000),
  recappedAt: ms.nullable().optional(),
});

export const TABLE_SCHEMAS = {
  semesters: SemesterSchema,
  courses: CourseSchema,
  classSessions: ClassSessionSchema,
  assignments: AssignmentSchema,
  subtasks: SubtaskSchema,
  exams: ExamSchema,
  sessions: SessionSchema,
  files: FileAttachmentSchema,
  missedChecks: MissedCheckLogSchema,
  lectures: LectureSchema,
} satisfies Record<SyncTable, z.ZodObject>;

/** Schema the server accepts on push: userId/rev are assigned by the server. */
export function pushSchemaFor(table: SyncTable) {
  return (TABLE_SCHEMAS[table] as z.ZodObject<typeof baseFields>)
    .omit({ userId: true, rev: true })
    .extend({ userId: z.string().optional(), rev: z.number().optional() });
}

export const PushBodySchema = z.object({
  changes: z
    .array(z.object({ table: z.string(), record: z.record(z.string(), z.unknown()) }))
    .max(500),
});

export const PlannerRequestSchema = z
  .object({
    assignmentId: id.optional(),
    examId: id.optional(),
    totalMinutes: z.number().int().min(15).max(60 * 40),
    before: ms.optional(),
  })
  .refine((v) => !!v.assignmentId !== !!v.examId, 'Give exactly one of assignmentId or examId');

export const CloudinaryConfigInput = z.object({
  cloudName: z.string().min(1).max(100),
  apiKey: z.string().min(1).max(100),
  apiSecret: z.string().min(1).max(200),
  folder: z.string().max(100).optional(),
});
export const StoragePutSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('cloudinary'),
    useOwner: z.boolean().optional(),
    cloudinary: CloudinaryConfigInput.optional(),
    pdfDeliveryConfirmed: z.boolean(),
  }),
  z.object({ provider: z.literal('gdrive') }),
]);

export const FileSignSchema = z.object({
  attachmentId: id,
  resourceType: z.enum(['raw', 'image']),
  folder: z.string().max(300).optional(),
  mime: z.string().max(200),
  size: z.number().int().positive(),
});
export const DriveSessionSchema = z.object({
  attachmentId: id,
  name: z.string().min(1).max(255),
  mime: z.string().max(200),
  size: z.number().int().positive(),
});

export const CalendarsPutSchema = z.object({
  timetableCalendarIds: z.array(z.string()).max(20),
  busyCalendarIds: z.array(z.string()).max(20),
});

export const AuthGoogleSchema = z.object({
  idToken: z.string().min(10),
  serverAuthCode: z.string().min(4).optional(),
  timezone: z.string().optional(),
});
export const RefreshSchema = z.object({ refreshToken: z.string().min(10) });

// ---- Access requests (people Google blocks while the OAuth app is in Testing) ----
export const AccessRequestBodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(80).optional(),
});
export const ACCESS_REQUEST_STATUSES = ['pending', 'added', 'notified', 'dismissed'] as const;
export const AccessRequestPatchSchema = z.object({ status: z.enum(ACCESS_REQUEST_STATUSES) });

// ---- Feedback ----
export const FEEDBACK_KINDS = ['bug', 'idea', 'other'] as const;
export const FeedbackBodySchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  message: z.string().trim().min(3).max(4000),
  appVersion: z.string().max(40).optional(),
  device: z.string().max(120).optional(),
});
export const FeedbackPatchSchema = z.object({ read: z.boolean() });

// ---- Sharing an assignment / exam with a friend (opened in the app only) ----
export const SHARE_KINDS = ['assignment', 'exam', 'lecture'] as const;
export const ShareCreateSchema = z.object({ kind: z.enum(SHARE_KINDS), id });
/** Share tokens are random base64url strings. */
export const ShareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{8,40}$/);

// ---- Course communities ----
export const CommunityCourseSchema = z.object({
  code: z.string().trim().min(2).max(40),
  shortName: z.string().trim().min(1).max(24),
  title: z.string().trim().max(200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export const CommunityCreateSchema = z.object({ name: z.string().trim().min(2).max(80), course: CommunityCourseSchema });
export const CommunityJoinSchema = z.object({ token: ShareTokenSchema, autoSave: z.boolean().optional() });
export const CommunityMemberPatchSchema = z.object({ autoSave: z.boolean() });
export const CommunityAckSchema = z.object({ ids: z.array(z.string().max(64)).max(100) });
/** autoSave: the creator asks members' apps to save it for them (members who opted in). */
const autoSave = z.boolean().optional();
export const CommunityPostCreateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('assignment'), id, autoSave }),
  z.object({ kind: z.literal('exam'), id, autoSave }),
  z.object({ kind: z.literal('lecture'), id, autoSave }),
  z.object({ kind: z.literal('session'), id, autoSave }),
  z.object({
    kind: z.literal('resource'),
    title: z.string().trim().min(1).max(200),
    url: z.string().trim().url().max(2000).nullable().optional(),
    note: z.string().max(4000).optional(),
  }),
]);
