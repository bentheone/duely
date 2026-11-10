import {
  DAY,
  DEFAULT_TIMEZONE,
  EXAM_TYPE_LABELS,
  formatDue,
  formatHHMM,
  isAssignmentOpen,
  startOfZonedDay,
  type User,
} from '@duely/shared';
import { snapshot } from '@/lib/db/queries';
import { getMetaJson } from '@/lib/db/repo';

export interface WidgetData {
  scheme: 'light' | 'dark';
  next: { label: string; time: string; color: string } | null;
  due: { title: string; when: string; color: string; overdue: boolean }[];
  dueThisWeek: number;
  exam: { days: number; label: string; color: string } | null;
}

/** Reads SQLite directly — runs in the headless widget task too. */
export function widgetData(now = Date.now()): WidgetData {
  const user = getMetaJson<User | null>('user', null);
  const tz = user?.timezone ?? DEFAULT_TIMEZONE;
  const snap = snapshot();
  const active = new Map(snap.courses.filter((c) => c.status === 'active').map((c) => [c.id, c]));

  const classes = snap.classSessions
    .filter((s) => s.end > now && active.has(s.courseId))
    .map((s) => ({ start: s.start, label: active.get(s.courseId)!.shortName, color: active.get(s.courseId)!.color }));
  const sessions = snap.sessions
    .filter((s) => s.status === 'confirmed' && s.end > now)
    .map((s) => {
      const a = s.assignmentId ? snap.assignments.find((x) => x.id === s.assignmentId) : undefined;
      const c = a ? active.get(a.courseId) : undefined;
      return { start: s.start, label: c ? `${c.shortName} · ${s.title}` : s.title, color: c?.color ?? '#475569' };
    });
  const nextItem = [...classes, ...sessions].sort((a, b) => a.start - b.start)[0];
  const sameDay = nextItem && startOfZonedDay(nextItem.start, tz) === startOfZonedDay(now, tz);

  const open = snap.assignments
    .filter((a) => isAssignmentOpen(a) && a.dueAt && active.has(a.courseId))
    .sort((a, b) => a.dueAt! - b.dueAt!);
  const weekEnd = startOfZonedDay(now, tz) + 7 * DAY;
  const exam = snap.exams.filter((e) => e.startsAt > now && active.has(e.courseId)).sort((a, b) => a.startsAt - b.startsAt)[0];

  return {
    scheme: user?.settings.theme === 'dark' ? 'dark' : 'light',
    next: nextItem
      ? { label: nextItem.label, time: sameDay ? formatHHMM(nextItem.start, tz) : formatDue(nextItem.start, now, tz), color: nextItem.color }
      : null,
    due: open.slice(0, 2).map((a) => ({
      title: a.title,
      when: formatDue(a.dueAt!, now, tz),
      color: active.get(a.courseId)!.color,
      overdue: a.dueAt! < now,
    })),
    dueThisWeek: open.filter((a) => a.dueAt! < weekEnd).length,
    exam: exam
      ? {
          days: Math.max(0, Math.round((startOfZonedDay(exam.startsAt, tz) - startOfZonedDay(now, tz)) / DAY)),
          label: `${active.get(exam.courseId)!.shortName} ${EXAM_TYPE_LABELS[exam.type].toLowerCase()}`,
          color: active.get(exam.courseId)!.color,
        }
      : null,
  };
}
