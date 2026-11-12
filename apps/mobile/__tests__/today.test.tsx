import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { zonedTime, type Assignment, type ClassSession, type Course, type Session } from '@duely/shared';
import { buildToday } from '@/features/today';
import { TodayView } from '@/features/TodayView';

const TZ = 'Africa/Kigali';
const at = (d: number, h: number, m = 0) => zonedTime(TZ, 2026, 11, d, h, m);
const NOW = at(10, 13); // Tue 10 Nov, 13:00
const base = { userId: 'u', createdAt: 0, updatedAt: 0, deletedAt: null, rev: 0 };
const course = (id: string, shortName: string, status: Course['status'] = 'active'): Course => ({
  ...base, id, semesterId: 's', code: '', title: shortName, shortName, color: '#EA580C', status, matchRules: [],
});
const asg = (id: string, courseId: string, dueAt: number, extra: Partial<Assignment> = {}): Assignment => ({
  ...base, id, courseId, semesterId: 's', title: `Task ${id}`, notes: '', links: [], dueAt, kind: 'individual',
  submission: 'moodle', status: 'not_started', progressMode: 'auto', ...extra,
});
const cls = (id: string, courseId: string, start: number, end: number): ClassSession => ({
  ...base, id, courseId, googleEventId: id, start, end, room: 'GB6', sourceCalendarId: 'cal',
});

const courses = [course('plsql', 'PL/SQL'), course('net', 'Networks'), course('old', 'Algebra', 'finished')];
const classSessions = [cls('c1', 'plsql', at(10, 10), at(10, 12)), cls('c2', 'net', at(10, 15), at(10, 17)), cls('c3', 'old', at(10, 8), at(10, 9)), cls('c4', 'net', at(11, 9), at(11, 10))];
const sessions: Session[] = [{ ...base, id: 's1', kind: 'work', assignmentId: 'a1', examId: null, title: 'Lab work', start: at(10, 18), end: at(10, 19, 30), status: 'confirmed' }];
const assignments = [
  asg('a1', 'plsql', at(10, 23, 59)),
  asg('a2', 'net', at(8, 17)),
  asg('a3', 'net', at(14, 17)),
  asg('a4', 'plsql', at(10, 17), { status: 'done' }),
  asg('a5', 'old', at(10, 17)),
  asg('a6', 'plsql', at(20, 17), { kind: 'group', group: { members: [], meetings: [{ at: at(10, 16), place: 'Library' }] } }),
];

const input = { now: NOW, tz: TZ, courses, classSessions, sessions, assignments, exams: [], missedChecks: [] };

describe('buildToday', () => {
  test('merges classes, sessions, meetings and due items; skips finished/done/other days', async () => {
    const { items } = buildToday(input);
    expect(items.map((i) => i.key)).toEqual(['o-a2', 'c-c1', 'c-c2', 'm-a6-' + at(10, 16), 's-s1', 'd-a1']);
    expect(items.find((i) => i.key === 'c-c1')!.faint).toBe(true); // already ended
    expect(items.find((i) => i.key === 'o-a2')!.danger).toBe(true);
  });

  test('class-ended card for the most recent unanswered class', () => {
    expect(buildToday(input).classEnded).toMatchObject({ course: { id: 'plsql' }, classSessionId: 'c1' });
    const answered = buildToday({ ...input, missedChecks: [{ ...base, id: 'm', courseId: 'plsql', classSessionId: 'c1', answer: 'none', at: NOW }] });
    expect(answered.classEnded).toBeNull();
  });
});

describe('<TodayView />', () => {
  test('renders date, items and the class-ended prompt', async () => {
    const { items, classEnded } = buildToday(input);
    const onAdd = jest.fn();
    const onNo = jest.fn();
    await render(
      <TodayView now={NOW} tz={TZ} items={items} classEnded={classEnded} onOpen={jest.fn()} onCalendar={jest.fn()}
        onAvatar={jest.fn()} onAdd={onAdd} onNo={onNo} />,
    );
    expect(screen.getByText('Tuesday')).toBeTruthy();
    expect(screen.getByText('10 Nov')).toBeTruthy();
    expect(screen.getByText('Task a1')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add'));
    expect(onAdd).toHaveBeenCalledWith('plsql', 'c1');
    await fireEvent.press(screen.getByText('No'));
    expect(onNo).toHaveBeenCalledWith('plsql', 'c1');
  });

  test('empty state', async () => {
    await render(<TodayView now={NOW} tz={TZ} items={[]} classEnded={null} onOpen={jest.fn()} onCalendar={jest.fn()}
        onAvatar={jest.fn()} onAdd={jest.fn()} onNo={jest.fn()} />);
    expect(screen.getByText('Nothing today.')).toBeTruthy();
  });
});
