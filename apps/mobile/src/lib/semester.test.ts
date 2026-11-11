import type { Course, Semester } from '@duely/shared';
import { pickSemester } from './semester';

const sem = (id: string, status: Semester['status'] = 'active') => ({ id, name: id, status, startsOn: '', endsOn: '', deletedAt: null }) as unknown as Semester;
const course = (id: string, semesterId: string, updatedAt = 1) => ({ id, semesterId, status: 'active', updatedAt, deletedAt: null }) as unknown as Course;

test('empty auto-created semester falls back to the one holding my courses', () => {
  const s = [sem('real'), sem('empty')];
  expect(pickSemester(s, [course('c1', 'real')], 'empty', null)?.id).toBe('real');
});
test('an explicitly picked empty semester is kept', () => {
  expect(pickSemester([sem('real'), sem('new')], [course('c1', 'real')], 'new', 'new')?.id).toBe('new');
});
test('a chosen semester with courses wins', () => {
  expect(pickSemester([sem('a'), sem('b')], [course('c1', 'a', 5), course('c2', 'b', 9)], 'a', null)?.id).toBe('a');
});
