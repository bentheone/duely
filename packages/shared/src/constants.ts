/** Course palette (§11.2). `dark` variants are used for dots/chips in dark mode. */
export const COURSE_PALETTE = [
  { key: 'orange', light: '#EA580C', dark: '#F97316' },
  { key: 'violet', light: '#7C3AED', dark: '#A855F7' },
  { key: 'teal', light: '#0D9488', dark: '#14B8A6' },
  { key: 'blue', light: '#2563EB', dark: '#3B82F6' },
  { key: 'green', light: '#16A34A', dark: '#22C55E' },
  { key: 'pink', light: '#DB2777', dark: '#EC4899' },
  { key: 'amber', light: '#D97706', dark: '#F59E0B' },
  { key: 'slate', light: '#475569', dark: '#94A3B8' },
] as const;

export type PaletteKey = (typeof COURSE_PALETTE)[number]['key'];

/** Returns the dark-mode variant for a light palette hex (falls back to the input). */
export function courseColorFor(hex: string, scheme: 'light' | 'dark'): string {
  if (scheme === 'light') return hex;
  const p = COURSE_PALETTE.find((c) => c.light.toLowerCase() === hex.toLowerCase());
  return p ? p.dark : hex;
}

export const DEFAULT_TIMEZONE = 'Africa/Kigali';

export const DEFAULT_SETTINGS = {
  theme: 'system' as 'system' | 'light' | 'dark',
  alarm: { enabled: true, leadMinutes: 30, everyClass: true, snoozeMinutes: 5, ringOnSilent: true },
  reminders: { dueOffsets: ['P3D', 'P1D', 'MORNING_OF'], morningTime: '07:00' },
  missedCheck: {
    afterClass: true,
    weekly: true,
    weeklyDay: 0,
    weeklyTime: '19:00',
    quietDays: 7,
  },
  workHours: { start: '07:00', end: '22:00' },
  sessionDefaultMinutes: 90,
  lectures: { logReminder: true, recapReminder: true, recapLeadMinutes: 20 },
};

export type UserSettings = typeof DEFAULT_SETTINGS;

/** Tables that travel through /sync (§6). classSessions is server-written, pull-only. */
export const SYNC_TABLES = [
  'semesters',
  'courses',
  'classSessions',
  'assignments',
  'subtasks',
  'exams',
  'sessions',
  'files',
  'missedChecks',
  'lectures',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];
export const CLIENT_WRITABLE_TABLES: readonly SyncTable[] = SYNC_TABLES.filter(
  (t) => t !== 'classSessions',
);

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
  // Voice notes (expo-audio records AAC in an MP4/M4A container on Android).
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/mpeg',
] as const;

export const SUBMISSION_LABELS = {
  moodle: 'Moodle',
  email: 'Email',
  printed: 'Printed',
  in_class: 'In class',
  other: 'Other',
} as const;

export const EXAM_TYPE_LABELS = {
  quiz: 'Quiz',
  cat: 'CAT',
  midterm: 'Midterm',
  final: 'Final',
  other: 'Exam',
} as const;

export const STATUS_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
  submitted: 'Submitted',
  graded: 'Graded',
} as const;

/** Owner seed (§11.3) — offered on first run, editable. */
export const OWNER_SEED = {
  semester: { name: 'Fall 2026', startsOn: '2026-09-01', endsOn: '2026-12-20' },
  courses: [
    { shortName: 'Networks', code: 'INSY 8211', day: 'Mon', color: '#2563EB' },
    { shortName: 'PL/SQL', code: 'INSY 8311', day: 'Tue', color: '#EA580C', room: 'GB6' },
    { shortName: 'C', code: 'INSY 8212', day: 'Wed', color: '#0D9488' },
    { shortName: 'Soft Eng', code: 'SENG 8215', day: 'Wed', color: '#7C3AED' },
    { shortName: 'Health', code: 'HELT 8213', day: 'Thu', color: '#16A34A' },
    { shortName: 'Philosophy', code: 'RELT 8221', day: 'Fri', color: '#DB2777' },
  ],
} as const;

export const MISSED_PROMPT_LATER_MS = 2 * 60 * 60 * 1000;
export const CLASS_SESSION_HORIZON_DAYS = 21;
export const ALARM_HORIZON_DAYS = 7;
export const NOTIFICATION_HORIZON_DAYS = 30;
export const KEEP_OFFLINE_DAYS = 14;
