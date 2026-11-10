import {
  DAY,
  EXAM_TYPE_LABELS,
  HOUR,
  isAssignmentOpen,
  startOfZonedDay,
  type Assignment,
  type ClassSession,
  type Course,
  type Exam,
  type MissedCheckLog,
  type Session,
} from '@duely/shared';

export interface TodayItem {
  key: string;
  at: number | null; // null = overdue (no time column)
  end?: number;
  title: string;
  course?: Course;
  suffix?: string;
  kind: 'class' | 'session' | 'meeting' | 'due' | 'overdue' | 'exam';
  danger: boolean;
  faint: boolean;
  href?: string;
}

export interface TodayInput {
  now: number;
  tz: string;
  courses: Course[];
  classSessions: ClassSession[];
  sessions: Session[];
  assignments: Assignment[];
  exams: Exam[];
  missedChecks: MissedCheckLog[];
}

/** Pure merge of today's classes, sessions, meetings and due items (§11.3 #1). */
export function buildToday(i: TodayInput): { items: TodayItem[]; classEnded: { course: Course; classSessionId: string } | null } {
  const start = startOfZonedDay(i.now, i.tz);
  const end = start + DAY;
  const active = new Map(i.courses.filter((c) => c.status === 'active' && !c.deletedAt).map((c) => [c.id, c]));
  const items: TodayItem[] = [];

  for (const a of i.assignments) {
    const c = active.get(a.courseId);
    if (!c || !isAssignmentOpen(a) || a.dueAt == null) continue;
    if (a.dueAt < start) {
      items.push({ key: `o-${a.id}`, at: null, title: a.title, course: c, suffix: 'Overdue', kind: 'overdue', danger: true, faint: false, href: `/assignment/${a.id}` });
    } else if (a.dueAt < end) {
      items.push({ key: `d-${a.id}`, at: a.dueAt, title: a.title, course: c, suffix: 'Due', kind: 'due', danger: true, faint: false, href: `/assignment/${a.id}` });
    }
    for (const m of a.group?.meetings ?? [])
      if (m.at >= start && m.at < end)
        items.push({ key: `m-${a.id}-${m.at}`, at: m.at, title: `Meeting · ${a.title}`, course: c, suffix: m.place ?? undefined, kind: 'meeting', danger: false, faint: m.at + HOUR < i.now, href: `/assignment/${a.id}` });
  }
  for (const cs of i.classSessions) {
    const c = active.get(cs.courseId);
    if (!c || cs.deletedAt || cs.start >= end || cs.end <= start) continue;
    items.push({ key: `c-${cs.id}`, at: cs.start, end: cs.end, title: c.shortName, course: c, suffix: cs.room ?? c.room ?? 'Class', kind: 'class', danger: false, faint: cs.end < i.now });
  }
  for (const s of i.sessions) {
    if (s.deletedAt || s.status !== 'confirmed' || s.start >= end || s.end <= start) continue;
    const a = s.assignmentId ? i.assignments.find((x) => x.id === s.assignmentId) : undefined;
    const ex = s.examId ? i.exams.find((x) => x.id === s.examId) : undefined;
    const c = active.get(a?.courseId ?? ex?.courseId ?? '');
    items.push({ key: `s-${s.id}`, at: s.start, end: s.end, title: s.title, course: c, suffix: s.kind === 'study' ? 'Study' : 'Work', kind: 'session', danger: false, faint: s.end < i.now, href: a ? `/assignment/${a.id}` : ex ? `/exam/${ex.id}` : undefined });
  }
  for (const e of i.exams) {
    const c = active.get(e.courseId);
    if (!c || e.deletedAt || e.startsAt < start || e.startsAt >= end) continue;
    items.push({ key: `e-${e.id}`, at: e.startsAt, title: `${c.shortName} ${EXAM_TYPE_LABELS[e.type].toLowerCase()}`, course: c, suffix: e.room ?? undefined, kind: 'exam', danger: true, faint: e.startsAt < i.now, href: `/exam/${e.id}` });
  }
  items.sort((a, b) => (a.at ?? -1) - (b.at ?? -1));

  // Contextual card: most recent class that ended within 3 h with no answer yet.
  const answered = new Set(i.missedChecks.filter((m) => m.answer !== 'later').map((m) => m.classSessionId));
  const ended = i.classSessions
    .filter((cs) => !cs.deletedAt && active.has(cs.courseId) && cs.end <= i.now && cs.end > i.now - 3 * HOUR && !answered.has(cs.id))
    .sort((a, b) => b.end - a.end)[0];
  return { items, classEnded: ended ? { course: active.get(ended.courseId)!, classSessionId: ended.id } : null };
}
