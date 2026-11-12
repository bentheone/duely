import { DEFAULT_SETTINGS } from './constants';
import { planNotifications } from './reminders';

const H = 3600_000;
const now = Date.UTC(2026, 10, 12, 6);
const base = { deletedAt: null };
const input = (lectures: Parameters<typeof planNotifications>[0]['lectures'] = []) => ({
  now,
  tz: 'Africa/Kigali',
  settings: DEFAULT_SETTINGS,
  courses: [{ id: 'c', shortName: 'PL/SQL', status: 'active' as const, deletedAt: null }],
  assignments: [],
  exams: [],
  sessions: [],
  classSessions: [
    { ...base, id: 'cs1', courseId: 'c', start: now + 2 * H, end: now + 4 * H },
    { ...base, id: 'cs2', courseId: 'c', start: now + 7 * 24 * H, end: now + 7 * 24 * H + 2 * H },
  ],
  lectures,
});

test('reminds to log after class unless logged; recaps the last lecture before the next class', () => {
  const plan = planNotifications(input());
  expect(plan.filter((p) => p.kind === 'lectureLog').map((p) => p.id)).toEqual(['lecturelog-cs1', 'lecturelog-cs2']);
  expect(plan.find((p) => p.id === 'lecturelog-cs1')!.at).toBe(now + 4 * H + 15 * 60_000);
  expect(plan.some((p) => p.kind === 'lectureRecap')).toBe(false);

  const logged = planNotifications(input([{ id: 'l1', courseId: 'c', classSessionId: 'cs1', at: now + 2 * H, title: 'Cursors', topics: ['Explicit cursors', 'FOR loops'], deletedAt: null }]));
  expect(logged.some((p) => p.id === 'lecturelog-cs1')).toBe(false);
  const recap = logged.find((p) => p.kind === 'lectureRecap')!;
  expect(recap).toMatchObject({ title: 'Recap PL/SQL before class', body: 'Explicit cursors · FOR loops', data: { url: 'duely://lecture/l1?recap=1' } });
  expect(recap.at).toBe(now + 7 * 24 * H - 20 * 60_000);
});

test('settings can turn both off', () => {
  const plan = planNotifications({ ...input(), settings: { ...DEFAULT_SETTINGS, lectures: { logReminder: false, recapReminder: false, recapLeadMinutes: 20 } } });
  expect(plan.some((p) => p.kind === 'lectureLog' || p.kind === 'lectureRecap')).toBe(false);
});
