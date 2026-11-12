import { DEFAULT_SETTINGS, NOTIFICATION_HORIZON_DAYS, EXAM_TYPE_LABELS, type UserSettings } from './constants';
import { isAssignmentOpen } from './progress';
import { DAY, MINUTE, formatHHMM, parseIsoDuration, zonedDayAt } from './time';
import type { Assignment, ClassSession, Course, Exam, Lecture, MissedCheckLog, Session } from './types';

export type NotificationKind = 'due' | 'exam' | 'session' | 'classEnd' | 'lectureLog' | 'lectureRecap';

export interface PlannedNotification {
  id: string;
  at: number;
  kind: NotificationKind;
  title: string;
  body: string;
  data: Record<string, string>;
}

type CourseLite = Pick<Course, 'id' | 'shortName' | 'status' | 'deletedAt'>;

export interface PlanInput {
  now: number;
  tz: string;
  settings: UserSettings;
  courses: CourseLite[];
  assignments: Pick<Assignment, 'id' | 'courseId' | 'title' | 'dueAt' | 'status' | 'reminderOffsets' | 'deletedAt'>[];
  exams: Pick<Exam, 'id' | 'courseId' | 'type' | 'startsAt' | 'room' | 'deletedAt'>[];
  sessions: Pick<Session, 'id' | 'title' | 'start' | 'status' | 'deletedAt'>[];
  classSessions: (Pick<ClassSession, 'id' | 'courseId' | 'end' | 'deletedAt'> & Partial<Pick<ClassSession, 'start'>>)[];
  lectures?: Pick<Lecture, 'id' | 'courseId' | 'classSessionId' | 'at' | 'title' | 'topics' | 'deletedAt'>[];
  /** Class-end prompts already answered (by classSessionId). */
  answeredClassSessionIds?: Set<string>;
}

/** Times for one assignment's due reminders (§8.2). */
export function dueReminderTimes(
  dueAt: number,
  offsets: string[],
  morningTime: string,
  tz: string,
): number[] {
  const out = new Set<number>();
  for (const o of offsets) {
    if (o === 'MORNING_OF') {
      const t = zonedDayAt(dueAt, tz, 0, morningTime);
      if (t < dueAt) out.add(t);
      continue;
    }
    const d = parseIsoDuration(o);
    if (!d) continue;
    if (d.days > 0 && d.ms === 0) out.add(zonedDayAt(dueAt, tz, -d.days, morningTime));
    else out.add(dueAt - d.days * DAY - d.ms);
  }
  return [...out].sort((a, b) => a - b);
}

/** Full local-notification plan for the next 30 days (re-run on any change). */
export function planNotifications(input: PlanInput): PlannedNotification[] {
  const { now, tz, settings } = input;
  const horizon = now + NOTIFICATION_HORIZON_DAYS * DAY;
  const active = new Map(
    input.courses.filter((c) => c.status === 'active' && !c.deletedAt).map((c) => [c.id, c]),
  );
  const out: PlannedNotification[] = [];
  const push = (n: PlannedNotification) => {
    if (n.at > now && n.at <= horizon) out.push(n);
  };

  for (const a of input.assignments) {
    if (a.deletedAt || !a.dueAt || !isAssignmentOpen(a)) continue;
    const c = active.get(a.courseId);
    if (!c) continue;
    const offsets = a.reminderOffsets ?? settings.reminders.dueOffsets;
    for (const at of dueReminderTimes(a.dueAt, offsets, settings.reminders.morningTime, tz)) {
      const days = Math.round((zonedDayAt(a.dueAt, tz, 0, '00:00') - zonedDayAt(at, tz, 0, '00:00')) / DAY);
      const when = days === 0 ? `today ${formatHHMM(a.dueAt, tz)}` : days === 1 ? 'tomorrow' : `in ${days} days`;
      push({
        id: `due-${a.id}-${at}`,
        at,
        kind: 'due',
        title: `${c.shortName} · ${a.title}`,
        body: `Due ${when}`,
        data: { url: `duely://assignment/${a.id}` },
      });
    }
  }

  for (const e of input.exams) {
    if (e.deletedAt) continue;
    const c = active.get(e.courseId);
    if (!c) continue;
    const label = `${c.shortName} ${EXAM_TYPE_LABELS[e.type].toLowerCase()}`;
    const time = formatHHMM(e.startsAt, tz);
    push({
      id: `exam-${e.id}-1d`,
      at: zonedDayAt(e.startsAt, tz, -1, settings.reminders.morningTime),
      kind: 'exam',
      title: label,
      body: `Tomorrow ${time}${e.room ? ` · ${e.room}` : ''}`,
      data: { url: `duely://exam/${e.id}` },
    });
    const morning = zonedDayAt(e.startsAt, tz, 0, settings.reminders.morningTime);
    if (morning < e.startsAt)
      push({
        id: `exam-${e.id}-0d`,
        at: morning,
        kind: 'exam',
        title: label,
        body: `Today ${time}${e.room ? ` · ${e.room}` : ''}`,
        data: { url: `duely://exam/${e.id}` },
      });
  }

  for (const s of input.sessions) {
    if (s.deletedAt || s.status !== 'confirmed') continue;
    push({
      id: `session-${s.id}`,
      at: s.start - 5 * MINUTE,
      kind: 'session',
      title: s.title,
      body: `Starts in 5 min · ${formatHHMM(s.start, tz)}`,
      data: { url: `duely://calendar` },
    });
  }

  if (settings.missedCheck.afterClass) {
    for (const cs of input.classSessions) {
      if (cs.deletedAt || input.answeredClassSessionIds?.has(cs.id)) continue;
      const c = active.get(cs.courseId);
      if (!c) continue;
      push({
        id: `classend-${cs.id}`,
        at: cs.end,
        kind: 'classEnd',
        title: `New assignment from ${c.shortName}?`,
        body: 'Add it now so it isn’t missed.',
        data: { courseId: c.id, classSessionId: cs.id },
      });
    }
  }
  planLectureReminders(input, active, push);
  return out.sort((a, b) => a.at - b.at);
}

/** "Log the lecture" after class (unless logged) and "Recap last lecture" before the next class. */
function planLectureReminders(input: PlanInput, active: Map<string, CourseLite>, push: (n: PlannedNotification) => void) {
  const prefs = input.settings.lectures ?? DEFAULT_SETTINGS.lectures;
  const lectures = (input.lectures ?? []).filter((l) => !l.deletedAt);
  const logged = new Set(lectures.map((l) => l.classSessionId).filter(Boolean));
  for (const cs of input.classSessions) {
    if (cs.deletedAt) continue;
    const c = active.get(cs.courseId);
    if (!c) continue;
    if (prefs.logReminder && !logged.has(cs.id)) {
      push({
        id: `lecturelog-${cs.id}`,
        at: cs.end + 15 * MINUTE,
        kind: 'lectureLog',
        title: `Log today’s ${c.shortName} lecture`,
        body: 'Main topics, notes, photos — a minute now saves an hour later.',
        data: { url: `duely://lecture/new?courseId=${c.id}&classSessionId=${cs.id}` },
      });
    }
    if (prefs.recapReminder && cs.start != null) {
      const last = lectures
        .filter((l) => l.courseId === cs.courseId && l.at < cs.start! - 30 * MINUTE)
        .sort((a, b) => b.at - a.at)[0];
      if (last) {
        const topics = last.topics.length ? last.topics.slice(0, 3).join(' · ') : last.title || 'Your notes from last time';
        push({
          id: `lecturerecap-${cs.id}-${last.id}`,
          at: cs.start - prefs.recapLeadMinutes * MINUTE,
          kind: 'lectureRecap',
          title: `Recap ${c.shortName} before class`,
          body: topics,
          data: { url: `duely://lecture/${last.id}?recap=1` },
        });
      }
    }
  }
}

/**
 * §8.2 weekly review: active courses with no assignment added and no "none" answer
 * within quietDays. Returns course ids with days since last activity.
 */
export function coursesNeedingReview(
  courses: CourseLite[],
  assignments: Pick<Assignment, 'courseId' | 'createdAt' | 'deletedAt'>[],
  logs: Pick<MissedCheckLog, 'courseId' | 'answer' | 'at' | 'deletedAt'>[],
  quietDays: number,
  now: number,
  semesterStart?: number,
): { courseId: string; daysQuiet: number }[] {
  const out: { courseId: string; daysQuiet: number }[] = [];
  for (const c of courses) {
    if (c.status !== 'active' || c.deletedAt) continue;
    const last = Math.max(
      semesterStart ?? 0,
      ...assignments.filter((a) => a.courseId === c.id && !a.deletedAt).map((a) => a.createdAt),
      ...logs
        .filter((l) => l.courseId === c.id && !l.deletedAt && (l.answer === 'none' || l.answer === 'added'))
        .map((l) => l.at),
    );
    const daysQuiet = last > 0 ? Math.floor((now - last) / DAY) : quietDays;
    if (daysQuiet >= quietDays) out.push({ courseId: c.id, daysQuiet });
  }
  return out.sort((a, b) => b.daysQuiet - a.daysQuiet);
}
