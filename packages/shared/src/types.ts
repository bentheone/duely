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
