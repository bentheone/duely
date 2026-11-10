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
});
export const SettingsPatchSchema = z
  .object({
    theme: SettingsSchema.shape.theme,
    alarm: SettingsSchema.shape.alarm.partial(),
    reminders: SettingsSchema.shape.reminders.partial(),
    missedCheck: SettingsSchema.shape.missedCheck.partial(),
    workHours: SettingsSchema.shape.workHours.partial(),
    sessionDefaultMinutes: SettingsSchema.shape.sessionDefaultMinutes,
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
});

export const SemesterSchema = z.object({
  ...baseFields,
  name: z.string().min(1).max(80),
  startsOn: z.string(),
  endsOn: z.string(),
  status: z.enum(['active', 'archived']),
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
  ownerType: z.enum(['assignment', 'exam']),
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
