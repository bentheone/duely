import type { z } from 'zod';
import type {
  AssignmentSchema,
  ClassSessionSchema,
  CourseSchema,
  ExamSchema,
  FileAttachmentSchema,
  GroupInfoSchema,
  MissedCheckLogSchema,
  SemesterSchema,
  SessionSchema,
  SettingsPatchSchema,
  SubtaskSchema,
  UserSchema,
} from './schemas';
import type { SyncTable } from './constants';

export type User = z.infer<typeof UserSchema>;
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;
export type Semester = z.infer<typeof SemesterSchema>;
export type Course = z.infer<typeof CourseSchema>;
export type ClassSession = z.infer<typeof ClassSessionSchema>;
export type Assignment = z.infer<typeof AssignmentSchema>;
export type GroupInfo = z.infer<typeof GroupInfoSchema>;
export type Subtask = z.infer<typeof SubtaskSchema>;
export type Exam = z.infer<typeof ExamSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type FileAttachment = z.infer<typeof FileAttachmentSchema>;
export type MissedCheckLog = z.infer<typeof MissedCheckLogSchema>;

export interface TableRecordMap {
  semesters: Semester;
  courses: Course;
  classSessions: ClassSession;
  assignments: Assignment;
  subtasks: Subtask;
  exams: Exam;
  sessions: Session;
  files: FileAttachment;
  missedChecks: MissedCheckLog;
}
export type AnyRecord = TableRecordMap[SyncTable];

export interface PushChange<T extends SyncTable = SyncTable> {
  table: T;
  record: TableRecordMap[T];
}
export interface PushResponse {
  accepted: string[];
  conflicts: { table: SyncTable; record: AnyRecord }[];
  rejected: { id: string; reason: string }[];
}
export interface PullResponse {
  changes: { table: SyncTable; record: AnyRecord }[];
  maxRev: number;
  hasMore: boolean;
}

export interface Interval {
  start: number;
  end: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
}

export interface GoogleSyncSummary {
  classSessions: number;
  unmatchedEvents: { eventId: string; title: string; calendarId: string; recurring: boolean }[];
  sessionsWritten: number;
  sessionsPulled: number;
  tasksPushed: number;
  tasksCompletedFromGoogle: number;
  skipped?: string;
}

export interface CalendarListItem {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor?: string;
  timetable: boolean;
  busy: boolean;
}

export interface StorageInfo {
  provider: 'cloudinary' | 'gdrive' | null;
  usingOwnerCloudinary: boolean;
  cloudName?: string;
  pdfDeliveryConfirmed: boolean;
  hasDriveScope: boolean;
}

export type AccessRequestStatus = (typeof import('./schemas').ACCESS_REQUEST_STATUSES)[number];
export interface AccessRequest {
  id: string;
  email: string;
  name: string | null;
  status: AccessRequestStatus;
  requests: number;
  createdAt: number;
  updatedAt: number;
  notifiedAt: number | null;
}

export type FeedbackKind = (typeof import('./schemas').FEEDBACK_KINDS)[number];
export interface FeedbackItem {
  id: string;
  kind: FeedbackKind;
  message: string;
  email: string;
  name: string;
  appVersion: string | null;
  device: string | null;
  read: boolean;
  createdAt: number;
}

/** Error codes the API puts in `{ code }` so the app can react (not just show text). */
export type ApiErrorCode = 'google_access_denied';

export type ShareKind = 'assignment' | 'exam';

/**
 * Snapshot of an assignment or exam someone shared (§ sharing). The recipient's app copies it into
 * their own data through the normal sync path; nothing of the sender's account is linked.
 */
export interface SharedItem {
  token: string;
  kind: ShareKind;
  from: { name: string };
  createdAt: number;
  course: { code: string; shortName: string; title: string; color: string };
  assignment?: {
    title: string;
    notes: string;
    links: { title: string; url: string }[];
    dueAt: number | null;
    kind: 'individual' | 'group';
    submission: 'moodle' | 'email' | 'printed' | 'in_class' | 'other';
    marks: number | null;
    group: {
      members: { name: string; phone?: string | null; whatsapp?: string | null; isMe: boolean }[];
      myPart?: string | null;
      meetings: { at: number; place?: string | null }[];
      chatLink?: string | null;
    } | null;
    subtasks: { title: string; dueAt: number | null; order: number }[];
  };
  exam?: {
    type: 'quiz' | 'cat' | 'midterm' | 'final' | 'other';
    startsAt: number;
    durationMin: number | null;
    room: string | null;
    topics: { title: string }[];
    notes: string;
  };
  /** Attachments the recipient can download (Cloudinary only; Drive files stay private). */
  files: { id: string; name: string; mime: string; size: number }[];
}
