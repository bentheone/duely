import { parseQuickAdd } from './parse';
import { defaultMatchRules } from './match';
import { formatHHMM, zonedParts } from './time';
import type { Course } from './types';

const TZ = 'Africa/Kigali';
// Tuesday 10 Nov 2026, 10:00 Kigali (08:00 UTC)
const NOW = Date.UTC(2026, 10, 10, 8, 0);

function course(id: string, shortName: string, code: string, title: string, status: Course['status'] = 'active'): Course {
  return {
    id, userId: 'u', createdAt: 0, updatedAt: 0, deletedAt: null, rev: 0,
    semesterId: 's', code, title, shortName, color: '#EA580C', status,
    matchRules: defaultMatchRules({ code, shortName, title }),
  };
}

const COURSES = [
  course('net', 'Networks', 'INSY 8211', 'Computer Networks'),
  course('plsql', 'PL/SQL', 'INSY 8311', 'Database Programming with PL/SQL'),
  course('c', 'C', 'INSY 8212', 'Programming in C'),
  course('se', 'Soft Eng', 'SENG 8215', 'Software Engineering'),
  course('health', 'Health', 'HELT 8213', 'Health and Wellness'),
  course('phil', 'Philosophy', 'RELT 8221', 'Philosophy of Religion'),
  course('old', 'Algebra', 'MATH 1101', 'Linear Algebra', 'finished'),
];

const p = (s: string) => parseQuickAdd(s, COURSES, { now: NOW, timezone: TZ });
const local = (t: number) => {
  const z = zonedParts(t, TZ);
  return `${z.year}-${String(z.month).padStart(2, '0')}-${String(z.day).padStart(2, '0')} ${formatHHMM(t, TZ)}`;
};

describe('parseQuickAdd', () => {
  test('spec example', () => {
    const r = p('PL/SQL lab on cursors fri 5pm group');
    expect(r.courseId).toBe('plsql');
    expect(r.title).toBe('Lab on cursors');
    expect(local(r.dueAt!)).toBe('2026-11-13 17:00');
    expect(r.kind).toBe('group');
    expect(r.isExam).toBe(false);
    expect(r.spans.map((s) => s.kind)).toEqual(['course', 'date', 'kind']);
  });

  test('spans point into the original string', () => {
    const s = 'PL/SQL lab on cursors fri 5pm group';
    for (const sp of p(s).spans) expect(s.slice(sp.start, sp.end)).toBe(sp.text);
  });

  test('date without time defaults to 23:59', () => {
    expect(local(p('Networks report 23 nov').dueAt!)).toBe('2026-11-23 23:59');
  });
  test('tomorrow', () => expect(local(p('C exercises tomorrow').dueAt!)).toBe('2026-11-11 23:59'));
  test('tomorrow with time', () => expect(local(p('C exercises tomorrow 8am').dueAt!)).toBe('2026-11-11 08:00'));
  test('in 3 days', () => expect(local(p('Health essay in 3 days').dueAt!)).toBe('2026-11-13 23:59'));
  test('weekday is forward-dated', () => expect(local(p('Philosophy reading mon').dueAt!)).toBe('2026-11-16 23:59'));
  test('same weekday means next week when time passed', () => {
    expect(local(p('Networks lab tue 9am').dueAt!)).toBe('2026-11-17 09:00');
  });
  test('24h time', () => expect(local(p('Soft Eng SRS fri 17:30').dueAt!)).toBe('2026-11-13 17:30'));
  test('month name first', () => expect(local(p('PL/SQL project Dec 2').dueAt!)).toBe('2026-12-02 23:59'));
  test('next week', () => expect(p('Networks reading next week').dueAt).toBeGreaterThan(NOW));
  test('no date', () => {
    const r = p('Soft Eng diagrams');
    expect(r.dueAt).toBeUndefined();
    expect(r.title).toBe('Diagrams');
  });

  test('course by code with space', () => expect(p('INSY 8311 lab').courseId).toBe('plsql'));
  test('course by code without space', () => expect(p('insy8211 subnetting').courseId).toBe('net'));
  test('course case-insensitive', () => expect(p('pl/sql triggers').courseId).toBe('plsql'));
  test('single-letter course C', () => {
    const r = p('C pointers worksheet thu');
    expect(r.courseId).toBe('c');
    expect(r.title).toBe('Pointers worksheet');
  });
  test('C does not match inside words', () => expect(p('Calculus notes').courseId).toBeUndefined());
  test('C++ is not course C', () => expect(p('C++ notes').courseId).toBeUndefined());
  test('title word rule matches course', () => expect(p('software engineering essay').courseId).toBe('se'));
  test('longest match wins', () => expect(p('Soft Eng report').courseId).toBe('se'));
  test('finished course is ignored', () => expect(p('Algebra homework').courseId).toBeUndefined());
  test('unknown course', () => {
    const r = p('Read chapter four');
    expect(r.courseId).toBeUndefined();
    expect(r.title).toBe('Read chapter four');
  });

  test('individual keyword', () => expect(p('C lab solo').kind).toBe('individual'));
  test('team keyword', () => expect(p('Soft Eng sprint team').kind).toBe('group'));
  test('grp keyword', () => expect(p('Networks topology grp').kind).toBe('group'));
  test('moodle submission', () => {
    const r = p('Health essay on moodle fri');
    expect(r.submission).toBe('moodle');
    expect(r.title).toBe('Essay');
  });
  test('email submission', () => expect(p('Philosophy reflection email').submission).toBe('email'));
  test('printed submission', () => expect(p('Soft Eng report printed').submission).toBe('printed'));
  test('print submission', () => expect(p('Soft Eng report print').submission).toBe('printed'));
  test('in class submission', () => expect(p('C exercise in class wed').submission).toBe('in_class'));

  test('quiz switches to exam', () => {
    const r = p('Networks quiz thu 9am');
    expect(r.isExam).toBe(true);
    expect(r.examType).toBe('quiz');
    expect(r.title).toBe('Quiz');
    expect(local(r.dueAt!)).toBe('2026-11-12 09:00');
  });
  test('CAT', () => expect(p('PL/SQL CAT mon').examType).toBe('cat'));
  test('midterm', () => expect(p('Networks midterm 20 nov 8am').examType).toBe('midterm'));
  test('mid', () => expect(p('C mid friday').examType).toBe('midterm'));
  test('final exam', () => {
    const r = p('Philosophy final exam dec 10');
    expect(r.examType).toBe('final');
    expect(r.title).toBe('Final');
  });
  test('final report is not an exam', () => {
    const r = p('Soft Eng final report fri');
    expect(r.isExam).toBe(false);
    expect(r.title).toBe('Final report');
  });
  test('plain exam', () => expect(p('Health exam 1 dec').examType).toBe('other'));
  test('exam drops kind/submission', () => {
    const r = p('Networks quiz group');
    expect(r.kind).toBeUndefined();
  });

  test('strips dangling "due"', () => expect(p('Health essay due fri').title).toBe('Essay'));
  test('capitalises title', () => expect(p('networks lab report').title).toBe('Lab report'));
  test('empty input', () => {
    const r = p('');
    expect(r.title).toBe('');
    expect(r.spans).toEqual([]);
  });
  test('code digits are not parsed as a year', () => {
    const r = p('INSY 8311 lab');
    expect(r.dueAt).toBeUndefined();
  });
});
