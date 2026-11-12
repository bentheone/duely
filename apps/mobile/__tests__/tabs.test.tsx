/**
 * Smoke tests: every bottom-nav tab must render with realistic data without throwing
 * (first-build bug: the app closed when switching to Assignments / Calendar / Exams).
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { zonedTime, type Assignment, type ClassSession, type Course, type Exam, type Semester, type Session } from '@duely/shared';

const TZ = 'Africa/Kigali';
const NOW = Date.now();
const at = (dayOffset: number, h: number) => {
  const d = new Date(NOW + dayOffset * 86400_000);
  return zonedTime(TZ, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, 0);
};
const base = { userId: 'u', createdAt: 0, updatedAt: 0, deletedAt: null, rev: 0 };

const mockSemesters: Semester[] = [{ ...base, id: 'sem', name: 'Fall 2026', startsOn: '2026-09-01', endsOn: '2026-12-20', status: 'active' }];
const mockCourses: Course[] = [
  { ...base, id: 'plsql', semesterId: 'sem', code: 'INSY 8311', title: 'PL/SQL', shortName: 'PL/SQL', color: '#EA580C', status: 'active', matchRules: [] },
  { ...base, id: 'net', semesterId: 'sem', code: 'INSY 8211', title: 'Networks', shortName: 'Networks', color: '#2563EB', status: 'active', matchRules: [] },
];
const mockClassSessions: ClassSession[] = [
  { ...base, id: 'c1', courseId: 'plsql', googleEventId: 'g1', start: at(0, 9), end: at(0, 11), room: 'GB6', sourceCalendarId: 'cal' },
];
const mockAssignments: Assignment[] = [
  { ...base, id: 'a1', courseId: 'plsql', semesterId: 'sem', title: 'Lab', notes: '', links: [], dueAt: at(2, 17), kind: 'group', submission: 'moodle', status: 'not_started', progressMode: 'auto', group: { members: [], meetings: [{ at: at(0, 14), place: 'Library' }] } },
  { ...base, id: 'a2', courseId: 'net', semesterId: 'sem', title: 'Report', notes: '', links: [], dueAt: null, kind: 'individual', submission: 'moodle', status: 'done', progressMode: 'auto' },
];
const mockExams: Exam[] = [{ ...base, id: 'e1', courseId: 'net', semesterId: 'sem', type: 'midterm', startsAt: at(5, 8), durationMin: 120, room: null, topics: [], notes: '' }];
const mockSessions: Session[] = [{ ...base, id: 's1', kind: 'work', assignmentId: 'a1', examId: null, title: 'Lab work', start: at(0, 18), end: at(0, 19), status: 'confirmed' }];

const mockLectures = [
  { ...base, id: 'l1', courseId: 'plsql', semesterId: 'sem', classSessionId: null, at: at(-2, 9), title: 'Cursors', topics: ['Explicit cursors'], blocks: [{ id: 'b1', type: 'research', text: 'REF cursors', done: false }] },
];

jest.mock('@/lib/db/queries', () => ({
  useSemesters: () => mockSemesters,
  useActiveSemester: () => mockSemesters[0],
  useAllCourses: () => mockCourses,
  useCourses: () => ({ active: mockCourses, finished: [], byId: new Map(mockCourses.map((c) => [c.id, c])) }),
  useAssignments: () => mockAssignments,
  useExams: () => mockExams,
  useSessions: () => mockSessions,
  useClassSessions: () => mockClassSessions,
  useMissedChecks: () => [],
  useSubtasks: () => [],
  useLectures: () => mockLectures,
}));
jest.mock('@/lib/sync/engine', () => ({ syncNow: jest.fn(() => Promise.resolve()) }));
jest.mock('@/lib/api', () => ({ api: jest.fn(() => Promise.resolve({ suggestions: [], busy: [] })) }));
jest.mock('@/features/actions', () => ({ logMissed: jest.fn(), addManualSession: jest.fn(), confirmSession: jest.fn() }));
jest.mock('@/lib/store', () => {
  const { DEFAULT_SETTINGS } = jest.requireActual('@duely/shared');
  const state = { user: { name: 'Ben', timezone: 'Africa/Kigali', settings: DEFAULT_SETTINGS }, syncing: false, syncError: null, online: true };
  return {
    useApp: (sel: (s: typeof state) => unknown) => sel(state),
    useTz: () => 'Africa/Kigali',
    useSettings: () => DEFAULT_SETTINGS,
  };
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Today from '@/app/(tabs)/today';
import Assignments from '@/app/(tabs)/assignments';
import Calendar from '@/app/calendar';
import Lectures from '@/app/(tabs)/lectures';
import Exams from '@/app/(tabs)/exams';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
const wrap = (el: React.ReactElement) => <QueryClientProvider client={qc}>{el}</QueryClientProvider>;
afterEach(() => qc.clear());

describe('bottom-nav tabs render', () => {
  test('Today', async () => {
    await render(wrap(<Today />));
    expect(screen.getAllByText(/Lab/).length).toBeGreaterThan(0);
  });
  test('Assignments', async () => {
    await render(wrap(<Assignments />));
    expect(screen.getByText('Assignments')).toBeTruthy();
    expect(screen.getByText('Lab')).toBeTruthy();
    expect(screen.getByLabelText('Courses and settings')).toBeTruthy();
  });
  test('Calendar', async () => {
    await render(wrap(<Calendar />));
    expect(screen.getAllByText(/PL\/SQL/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Pick a month')).toBeTruthy();
  });
  test('Lectures', async () => {
    await render(wrap(<Lectures />));
    expect(screen.getByText('Cursors')).toBeTruthy();
    expect(screen.getByText('Relook later · 1')).toBeTruthy();
    // Today's class ended? It's listed to log only after it ends — the heading exists either way.
    expect(screen.getByLabelText('Courses and settings')).toBeTruthy();
  });
  test('Exams', async () => {
    await render(wrap(<Exams />));
    expect(screen.getByText('Midterm')).toBeTruthy();
    expect(screen.getByLabelText('Courses and settings')).toBeTruthy();
  });
});
