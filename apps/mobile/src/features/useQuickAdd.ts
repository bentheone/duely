import { useMemo, useState } from 'react';
import { parseQuickAdd, type Course, type ParseResult } from '@duely/shared';

export type Mode = 'assignment' | 'exam';

export interface QuickAddOverrides {
  mode?: Mode;
  courseId?: string;
  dueAt?: number | null;
  kind?: 'individual' | 'group';
  submission?: 'moodle' | 'email' | 'printed' | 'in_class' | 'other';
  examType?: 'quiz' | 'cat' | 'midterm' | 'final' | 'other';
  reminderOffsets?: string[] | null;
  room?: string;
}

export interface QuickAddValues {
  mode: Mode;
  title: string;
  courseId?: string;
  dueAt?: number | null;
  kind: 'individual' | 'group';
  submission: 'moodle' | 'email' | 'printed' | 'in_class' | 'other';
  examType: 'quiz' | 'cat' | 'midterm' | 'final' | 'other';
  reminderOffsets: string[] | null;
  room?: string;
  parsed: ParseResult;
  valid: boolean;
}

/** Pure merge of parsed text + manual overrides (tested). Overrides win over the parser. */
export function resolveQuickAdd(parsed: ParseResult, o: QuickAddOverrides, prefillCourseId?: string): QuickAddValues {
  const mode: Mode = o.mode ?? (parsed.isExam ? 'exam' : 'assignment');
  const courseId = o.courseId ?? parsed.courseId ?? prefillCourseId;
  const dueAt = o.dueAt !== undefined ? o.dueAt : parsed.dueAt;
  const examType = o.examType ?? parsed.examType ?? 'other';
  const title = parsed.title || (mode === 'exam' ? '' : '');
  const valid = !!courseId && (mode === 'exam' ? !!dueAt : !!title.trim());
  return {
    mode,
    title,
    courseId,
    dueAt,
    kind: o.kind ?? parsed.kind ?? 'individual',
    submission: o.submission ?? parsed.submission ?? 'moodle',
    examType,
    reminderOffsets: o.reminderOffsets ?? null,
    room: o.room,
    parsed,
    valid,
  };
}

export function useQuickAdd(courses: Course[], tz: string, prefillCourseId?: string) {
  const [text, setText] = useState('');
  const [overrides, setOverrides] = useState<QuickAddOverrides>({});
  const now = useMemo(() => Date.now(), []);
  const parsed = useMemo(() => parseQuickAdd(text, courses, { now, timezone: tz }), [text, courses, now, tz]);
  const values = useMemo(() => resolveQuickAdd(parsed, overrides, prefillCourseId), [parsed, overrides, prefillCourseId]);
  return {
    text,
    setText,
    values,
    override: (p: QuickAddOverrides) => setOverrides((o) => ({ ...o, ...p })),
    reset: () => {
      setText('');
      setOverrides({});
    },
  };
}
