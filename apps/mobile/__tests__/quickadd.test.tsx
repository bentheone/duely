import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { defaultMatchRules, formatHHMM, parseQuickAdd, zonedParts, type Course } from '@duely/shared';
import { QuickAdd } from '@/features/QuickAdd';
import { resolveQuickAdd } from '@/features/useQuickAdd';

const TZ = 'Africa/Kigali';
const course = (id: string, shortName: string, code: string, color = '#EA580C'): Course => ({
  id,
  userId: 'u',
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
  rev: 0,
  semesterId: 's',
  code,
  title: shortName,
  shortName,
  color,
  status: 'active',
  matchRules: defaultMatchRules({ code, shortName, title: shortName }),
});
const COURSES = [course('plsql', 'PL/SQL', 'INSY 8311'), course('net', 'Networks', 'INSY 8211', '#2563EB')];

describe('resolveQuickAdd', () => {
  const now = Date.UTC(2026, 10, 10, 8);
  test('spec example → group assignment for PL/SQL due Fri 17:00', () => {
    const v = resolveQuickAdd(parseQuickAdd('PL/SQL lab on cursors fri 5pm group', COURSES, { now, timezone: TZ }), {});
    expect(v).toMatchObject({ mode: 'assignment', courseId: 'plsql', title: 'Lab on cursors', kind: 'group', valid: true });
    expect(zonedParts(v.dueAt!, TZ).weekday).toBe(5);
    expect(formatHHMM(v.dueAt!, TZ)).toBe('17:00');
  });
  test('overrides beat parser; exam keyword switches mode', () => {
    const parsed = parseQuickAdd('Networks midterm 20 nov 8am', COURSES, { now, timezone: TZ });
    expect(resolveQuickAdd(parsed, {}).mode).toBe('exam');
    expect(resolveQuickAdd(parsed, { mode: 'assignment', courseId: 'plsql' })).toMatchObject({ mode: 'assignment', courseId: 'plsql' });
  });
  test('prefilled course from class-end prompt', () => {
    const v = resolveQuickAdd(parseQuickAdd('reading chapter 3', COURSES, { now, timezone: TZ }), {}, 'net');
    expect(v.courseId).toBe('net');
    expect(v.valid).toBe(true);
  });
  test('needs a course', () => {
    expect(resolveQuickAdd(parseQuickAdd('something', COURSES, { now, timezone: TZ }), {}).valid).toBe(false);
  });
});

describe('<QuickAdd />', () => {
  test('typing fills the parsed rows and Save passes the values', async () => {
    const onSave = jest.fn();
    await render(<QuickAdd courses={COURSES} tz={TZ} defaultOffsets={['P1D']} onSave={onSave} />);
    await fireEvent.changeText(screen.getByTestId('quick-add-input'), 'PL/SQL lab on cursors fri 5pm group');
    expect(screen.getByTestId('row-course')).toHaveTextContent(/PL\/SQL/);
    expect(screen.getByTestId('row-kind')).toHaveTextContent(/Group/);
    expect(screen.getByTestId('row-due')).toHaveTextContent(/17:00/);
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [values] = onSave.mock.calls[0];
    expect(values).toMatchObject({ courseId: 'plsql', title: 'Lab on cursors', kind: 'group', mode: 'assignment' });
  });

  test('Save is disabled until a course is known', async () => {
    const onSave = jest.fn();
    await render(<QuickAdd courses={COURSES} tz={TZ} defaultOffsets={[]} onSave={onSave} />);
    await fireEvent.changeText(screen.getByTestId('quick-add-input'), 'read notes');
    await fireEvent.press(screen.getByText('Save'));
    expect(onSave).not.toHaveBeenCalled();
  });

  test('exam keywords switch the form to Exam fields', async () => {
    await render(<QuickAdd courses={COURSES} tz={TZ} defaultOffsets={[]} onSave={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('quick-add-input'), 'Networks quiz thu 9am');
    expect(screen.getByTestId('row-type')).toHaveTextContent(/Quiz/);
    expect(screen.queryByTestId('row-kind')).toBeNull();
  });
});
