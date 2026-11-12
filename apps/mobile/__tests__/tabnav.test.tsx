/**
 * Real expo-router tab navigator: press every bottom-nav icon like on the phone.
 * First-build bug: the app closed when leaving Today for Assignments / Calendar / Exams.
 */
import React from 'react';
import { fireEvent, screen, act } from '@testing-library/react-native';
import type { Course, Semester } from '@duely/shared';

jest.unmock('expo-router');

const mockSemesters: Semester[] = [{ id: 'sem', userId: 'u', createdAt: 0, updatedAt: 0, deletedAt: null, rev: 0, name: 'Fall 2026', startsOn: '2026-09-01', endsOn: '2026-12-20', status: 'active' }];
const mockCourses: Course[] = [
  { id: 'plsql', userId: 'u', createdAt: 0, updatedAt: 0, deletedAt: null, rev: 0, semesterId: 'sem', code: 'INSY 8311', title: 'PL/SQL', shortName: 'PL/SQL', color: '#EA580C', status: 'active', matchRules: [] },
];

jest.mock('@/lib/db/queries', () => ({
  useSemesters: () => mockSemesters,
  useActiveSemester: () => mockSemesters[0],
  useAllCourses: () => mockCourses,
  useCourses: () => ({ active: mockCourses, finished: [], byId: new Map(mockCourses.map((c) => [c.id, c])) }),
  useAssignments: () => [],
  useExams: () => [],
  useSessions: () => [],
  useClassSessions: () => [],
  useMissedChecks: () => [],
  useSubtasks: () => [],
  useLectures: () => [],
}));
jest.mock('@/lib/sync/engine', () => ({ syncNow: jest.fn(() => Promise.resolve()) }));
jest.mock('@/lib/api', () => ({ api: jest.fn(() => Promise.resolve({ suggestions: [], busy: [] })) }));
jest.mock('@/features/actions', () => ({ logMissed: jest.fn(), addManualSession: jest.fn(), confirmSession: jest.fn() }));
jest.mock('@/lib/store', () => {
  const { DEFAULT_SETTINGS } = jest.requireActual('@duely/shared');
  const state = { signedIn: true, user: { name: 'Ben', timezone: 'Africa/Kigali', settings: DEFAULT_SETTINGS }, syncing: false, syncError: null, online: true };
  return { useApp: (sel: (s: typeof state) => unknown) => sel(state), useTz: () => 'Africa/Kigali', useSettings: () => DEFAULT_SETTINGS };
});

import { renderRouter } from 'expo-router/testing-library';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TabsLayout from '@/app/(tabs)/_layout';
import Today from '@/app/(tabs)/today';
import Assignments from '@/app/(tabs)/assignments';
import Calendar from '@/app/calendar';
import Lectures from '@/app/(tabs)/lectures';
import Exams from '@/app/(tabs)/exams';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
afterEach(() => qc.clear());

test('switching between all bottom-nav tabs keeps the app alive', async () => {
  const errors: unknown[] = [];
  const spy = jest.spyOn(console, 'error').mockImplementation((...a) => errors.push(a));
  await renderRouter(
    {
      _layout: () => {
        const { Slot } = jest.requireActual('expo-router');
        return (
          <QueryClientProvider client={qc}>
            <Slot />
          </QueryClientProvider>
        );
      },
      '(tabs)/_layout': TabsLayout,
      '(tabs)/today': Today,
      '(tabs)/assignments': Assignments,
      '(tabs)/lectures': Lectures,
      calendar: Calendar,
      '(tabs)/exams': Exams,
      'quick-add': () => null,
    },
    { initialUrl: '/today' },
  );
  expect(screen.getByText('Nothing today.')).toBeTruthy();
  for (const [label, text] of [
    ['Assignments', 'Nothing due'],
    ['Lectures', 'No lectures yet'],
    ['Exams', 'No exams coming up'],
    ['Today', 'Nothing today.'],
    ['Exams', 'No exams coming up'],
  ] as const) {
    await act(async () => {
      await fireEvent.press(screen.getByLabelText(label));
    });
    if (text) expect(screen.getByText(text)).toBeTruthy();
  }
  spy.mockRestore();
  const real = errors.filter((e) => !String((e as unknown[])[0]).includes('not wrapped in act'));
  expect(real).toEqual([]);
});
