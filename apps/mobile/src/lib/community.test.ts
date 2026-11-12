import type { Course } from '@duely/shared';
import { courseForCode, inviteToken } from './community';

test('invite tokens from links and bare tokens', () => {
  expect(inviteToken('https://duely-api.vercel.app/c/AbC123xyz_-9')).toBe('AbC123xyz_-9');
  expect(inviteToken('duely://community/join/AbC123xyz')).toBe('AbC123xyz');
  expect(inviteToken('  AbC123xyz ')).toBe('AbC123xyz');
  expect(inviteToken('hello there')).toBeNull();
});

test('course codes match ignoring spaces and case', () => {
  const courses = [{ id: 'a', code: 'INSY 8311', status: 'active', deletedAt: null }, { id: 'b', code: 'insy8211', status: 'finished', deletedAt: null }] as unknown as Course[];
  expect(courseForCode('insy8311', courses)?.id).toBe('a');
  expect(courseForCode('INSY 8211', courses)).toBeNull();
});
