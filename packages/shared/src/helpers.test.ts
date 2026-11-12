import { computeProgress } from './progress';
import { computeClassAlarms } from './alarms';
import { findFreeSlots, countFreeSlots, mergeIntervals } from './slots';
import { dueReminderTimes, planNotifications, coursesNeedingReview } from './reminders';
import { contrastRatio, darkenForWhiteText, closestGoogleColorId } from './color';
import { matchCourse, defaultMatchRules } from './match';
import { DEFAULT_SETTINGS } from './constants';
import { HOUR, MINUTE, DAY, formatHHMM, zonedTime, zonedParts, parseIsoDuration, formatDue } from './time';
import { uuidv7 } from './uuid';
import { pushSchemaFor } from './schemas';
import type { Course } from './types';

const TZ = 'Africa/Kigali';
const NOW = Date.UTC(2026, 10, 10, 8, 0); // Tue 10:00 Kigali
const at = (d: number, h: number, m = 0) => zonedTime(TZ, 2026, 11, d, h, m);

const course = (id: string, status: Course['status'] = 'active'): Course => ({
  id, userId: 'u', createdAt: 0, updatedAt: 0, deletedAt: null, rev: 0, semesterId: 's',
  code: 'INSY 8311', title: 'Database Programming', shortName: 'PL/SQL', color: '#EA580C',
  status, matchRules: ['insy8311', 'pl/sql'], room: 'GB6',
});

describe('progress', () => {
  const a = { status: 'in_progress' as const, progressMode: 'auto' as const, progressManual: null };
  test('auto from subtasks', () =>
    expect(computeProgress(a, [{ done: true, deletedAt: null }, { done: false, deletedAt: null }, { done: true, deletedAt: null }, { done: false, deletedAt: null }])).toBe(50));
  test('ignores deleted subtasks', () =>
    expect(computeProgress(a, [{ done: true, deletedAt: null }, { done: false, deletedAt: 5 }])).toBe(100));
  test('no subtasks → 0', () => expect(computeProgress(a, [])).toBe(0));
  test('submitted → 100', () => expect(computeProgress({ ...a, status: 'submitted' }, [])).toBe(100));
  test('graded → 100', () => expect(computeProgress({ ...a, status: 'graded' }, [{ done: false, deletedAt: null }])).toBe(100));
  test('manual override', () => expect(computeProgress({ ...a, progressMode: 'manual', progressManual: 35 }, [{ done: true, deletedAt: null }])).toBe(35));
});

describe('time', () => {
  test('zonedTime round-trips', () => {
    const t = at(13, 17);
    expect(formatHHMM(t, TZ)).toBe('17:00');
    expect(zonedParts(t, TZ).weekday).toBe(5);
  });
  test('iso durations', () => {
    expect(parseIsoDuration('P3D')).toEqual({ days: 3, ms: 0 });
    expect(parseIsoDuration('PT2H')).toEqual({ days: 0, ms: 2 * HOUR });
    expect(parseIsoDuration('bad')).toBeNull();
  });
  test('formatDue', () => {
    expect(formatDue(at(10, 17), NOW, TZ)).toBe('Today 17:00');
    expect(formatDue(at(11, 23, 59), NOW, TZ)).toBe('Tomorrow');
    expect(formatDue(at(13, 17), NOW, TZ)).toBe('Fri 17:00');
    expect(formatDue(at(23, 17), NOW, TZ)).toBe('23 Nov');
  });
});

describe('alarms', () => {
  const sessions = [
    { id: 'a', courseId: 'c1', start: at(10, 14), end: at(10, 16), room: null, deletedAt: null },
    { id: 'b', courseId: 'c1', start: at(10, 17), end: at(10, 19), room: 'GB2', deletedAt: null },
    { id: 'c', courseId: 'c1', start: at(10, 10, 15), end: at(10, 12), room: null, deletedAt: null }, // alarm already passed
    { id: 'd', courseId: 'gone', start: at(11, 9), end: at(11, 10), room: null, deletedAt: null },
    { id: 'e', courseId: 'c1', start: at(30, 9), end: at(30, 10), room: null, deletedAt: null }, // > 7 days
  ];
  const courses = [course('c1'), course('gone', 'finished')];
  test('every class, 30 min before, active courses, 7-day horizon', () => {
    const r = computeClassAlarms(sessions, courses, DEFAULT_SETTINGS.alarm, NOW, TZ);
    expect(r.map((x) => x.id)).toEqual(['class-a', 'class-b']);
    expect(r[0]!.triggerAt).toBe(at(10, 13, 30));
    expect(r[0]!.subtitle).toBe('in 30 min · GB6');
    expect(r[1]!.subtitle).toBe('in 30 min · GB2');
    expect(contrastRatio(r[0]!.color, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
  test('first class per day only', () => {
    const r = computeClassAlarms(sessions, courses, { ...DEFAULT_SETTINGS.alarm, everyClass: false }, NOW, TZ);
    expect(r.map((x) => x.id)).toEqual(['class-a']);
  });
  test('disabled', () => expect(computeClassAlarms(sessions, courses, { ...DEFAULT_SETTINGS.alarm, enabled: false }, NOW, TZ)).toEqual([]));
});

describe('color', () => {
  test('darken orange passes 4.5', () => expect(contrastRatio(darkenForWhiteText('#EA580C'), '#FFFFFF')).toBeGreaterThanOrEqual(4.5));
  test('already dark untouched', () => expect(darkenForWhiteText('#111317')).toBe('#111317'));
  test('closest google colour', () => expect(closestGoogleColorId('#F4511E')).toBe('6'));
});

describe('slots', () => {
  const base = {
    from: NOW,
    before: at(13, 23, 59),
    workHours: { start: '07:00', end: '22:00' },
    tz: TZ,
    preferredMinutes: 90,
  };
  test('merge', () => expect(mergeIntervals([{ start: 1, end: 5 }, { start: 3, end: 8 }, { start: 10, end: 12 }])).toEqual([{ start: 1, end: 8 }, { start: 10, end: 12 }]));
  test('spreads over days, avoids busy, within work hours', () => {
    const busy = [
      { start: at(10, 10), end: at(10, 22) },
      { start: at(11, 7), end: at(11, 12) },
    ];
    const r = findFreeSlots({ ...base, busy, totalMinutes: 270 });
    expect(r).toHaveLength(3);
    const days = r.map((s) => zonedParts(s.start, TZ).day);
    expect(new Set(days).size).toBe(3);
    expect(formatHHMM(r[0]!.start, TZ)).toBe('12:00');
    for (const s of r) {
      for (const b of busy) expect(s.end <= b.start || s.start >= b.end).toBe(true);
      expect(s.end - s.start).toBe(90 * MINUTE);
    }
  });
  test('excludes gaps < 45 min', () => {
    const busy = [
      { start: at(10, 7), end: at(10, 12) },
      { start: at(10, 12, 30), end: at(13, 23, 59) },
    ];
    expect(findFreeSlots({ ...base, busy, totalMinutes: 90 })).toEqual([]);
  });
  test('never after before', () => {
    const r = findFreeSlots({ ...base, before: at(10, 12), busy: [], totalMinutes: 600 });
    for (const s of r) expect(s.end).toBeLessThanOrEqual(at(10, 12));
    expect(r).toHaveLength(1);
    expect(r[0]!.end - r[0]!.start).toBe(90 * MINUTE);
  });
  test('uses smaller gaps when needed (≥45)', () => {
    const busy = [
      { start: at(10, 10), end: at(10, 21) },
      { start: at(11, 0), end: at(13, 23, 59) },
    ];
    const r = findFreeSlots({ ...base, busy, totalMinutes: 90 });
    expect(r).toHaveLength(1);
    expect(r[0]!.end - r[0]!.start).toBe(60 * MINUTE);
  });
  test('count free slots', () => {
    expect(countFreeSlots({ ...base, busy: [] })).toBe(4);
  });
});

describe('reminders', () => {
  const s = DEFAULT_SETTINGS;
  test('due offsets P3D/P1D/MORNING_OF at morningTime', () => {
    const r = dueReminderTimes(at(20, 17), ['P3D', 'P1D', 'MORNING_OF'], '07:00', TZ);
    expect(r).toEqual([at(17, 7), at(19, 7), at(20, 7)]);
  });
  test('hour offset', () => expect(dueReminderTimes(at(20, 17), ['PT2H'], '07:00', TZ)).toEqual([at(20, 15)]));
  test('morning-of skipped when due before morning', () =>
    expect(dueReminderTimes(at(20, 6), ['MORNING_OF'], '07:00', TZ)).toEqual([]));
  test('plan: due, exam, session, class end; skips finished/done/past', () => {
    const plan = planNotifications({
      now: NOW, tz: TZ, settings: s,
      courses: [course('c1'), course('old', 'finished')],
      assignments: [
        { id: 'a1', courseId: 'c1', title: 'Lab', dueAt: at(14, 17), status: 'not_started', reminderOffsets: null, deletedAt: null },
        { id: 'a2', courseId: 'c1', title: 'Done', dueAt: at(14, 17), status: 'done', reminderOffsets: null, deletedAt: null },
        { id: 'a3', courseId: 'old', title: 'Old', dueAt: at(14, 17), status: 'not_started', reminderOffsets: null, deletedAt: null },
      ],
      exams: [{ id: 'e1', courseId: 'c1', type: 'midterm', startsAt: at(16, 9), room: 'GB6', deletedAt: null }],
      sessions: [
        { id: 's1', title: 'Study', start: at(11, 15), status: 'confirmed', deletedAt: null },
        { id: 's2', title: 'Sugg', start: at(11, 15), status: 'suggested', deletedAt: null },
      ],
      classSessions: [{ id: 'cs1', courseId: 'c1', end: at(10, 16), deletedAt: null }],
    });
    expect(plan.map((n) => n.id)).toEqual([
      'classend-cs1',
      'lecturelog-cs1',
      'due-a1-' + at(11, 7),
      'session-s1',
      'due-a1-' + at(13, 7),
      'due-a1-' + at(14, 7),
      'exam-e1-1d',
      'exam-e1-0d',
    ]);
    expect(plan.find((n) => n.kind === 'classEnd')!.title).toBe('New assignment from PL/SQL?');
  });
  test('weekly review', () => {
    const r = coursesNeedingReview(
      [course('c1'), course('c2'), course('c3', 'finished')],
      [{ courseId: 'c1', createdAt: NOW - 2 * DAY, deletedAt: null }],
      [{ courseId: 'c2', answer: 'later', at: NOW - DAY, deletedAt: null }],
      7, NOW, NOW - 12 * DAY,
    );
    expect(r).toEqual([{ courseId: 'c2', daysQuiet: 12 }]);
  });
});

describe('match', () => {
  const courses = [
    { ...course('plsql'), matchRules: defaultMatchRules({ code: 'INSY 8311', shortName: 'PL/SQL', title: 'Database Programming' }) },
    { ...course('net'), shortName: 'Networks', code: 'INSY 8211', matchRules: defaultMatchRules({ code: 'INSY 8211', shortName: 'Networks', title: 'Computer Networks' }) },
  ];
  test('by code in title', () => expect(matchCourse({ title: 'INSY8311 - Group F' }, courses)?.id).toBe('plsql'));
  test('by description', () => expect(matchCourse({ title: 'Lecture', description: 'Computer Networks' }, courses)?.id).toBe('net'));
  test('none', () => expect(matchCourse({ title: 'Gym' }, courses)).toBeNull());
});

describe('uuid & schemas', () => {
  test('uuid v7 shape & order', () => {
    const a = uuidv7(1000);
    const b = uuidv7(1000);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });
  test('push schema omits userId/rev requirement', () => {
    const c = course('x');
    const { userId: _u, rev: _r, ...rest } = c;
    expect(pushSchemaFor('courses').safeParse(rest).success).toBe(true);
    expect(pushSchemaFor('courses').safeParse({ ...rest, color: 'red' }).success).toBe(false);
  });
});
