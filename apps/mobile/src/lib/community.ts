import type { Course } from '@duely/shared';

/** Pulls the invite token out of a pasted link (…/c/<token> or duely://community/join/<token>) or a bare token. */
export function inviteToken(text: string): string | null {
  const m = /(?:\/c\/|community\/join\/)([A-Za-z0-9_-]{8,40})/.exec(text) ?? /^\s*([A-Za-z0-9_-]{8,40})\s*$/.exec(text);
  return m?.[1] ?? null;
}

export const normCode = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** My (active) course that a community's course code points at. */
export function courseForCode(code: string, courses: Course[]): Course | null {
  const k = normCode(code);
  return (k && courses.find((c) => c.status === 'active' && !c.deletedAt && normCode(c.code) === k)) || null;
}
