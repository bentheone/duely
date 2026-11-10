import type { Course } from './types';

type CourseMatchable = Pick<Course, 'id' | 'shortName' | 'code' | 'title' | 'matchRules' | 'status' | 'deletedAt'>;

const STOP = new Set([
  'and', 'the', 'of', 'to', 'in', 'for', 'a', 'an', 'on', 'with', 'introduction', 'intro',
  'i', 'ii', 'iii', 'class', 'lecture', 'lab', 'course',
]);

/** Default match rules for a course: code w/ + w/o space, short name, meaningful title words. */
export function defaultMatchRules(c: Pick<Course, 'code' | 'shortName' | 'title'>): string[] {
  const rules = new Set<string>();
  const code = c.code.trim().toLowerCase();
  if (code) {
    rules.add(code);
    rules.add(code.replace(/\s+/g, ''));
  }
  if (c.shortName.trim()) rules.add(c.shortName.trim().toLowerCase());
  for (const w of c.title.toLowerCase().split(/[^a-z0-9/+#]+/)) {
    if (w.length >= 4 && !STOP.has(w)) rules.add(w);
  }
  return [...rules];
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** Regex that matches `token` as a whole word (letters/digits boundaries), case-insensitive. */
export function wordRegex(token: string, flags = 'i'): RegExp {
  return new RegExp(`(?<![a-z0-9])${escapeRegex(token)}(?![a-z0-9])`, flags);
}

export function courseTokens(c: CourseMatchable): string[] {
  const t = new Set<string>();
  if (c.shortName) t.add(c.shortName.toLowerCase());
  if (c.code) {
    t.add(c.code.toLowerCase());
    t.add(c.code.toLowerCase().replace(/\s+/g, ''));
  }
  for (const r of c.matchRules) if (r.trim()) t.add(r.trim().toLowerCase());
  return [...t];
}

/**
 * §7.2 course matching for calendar events: best (longest token) match among active courses,
 * searched in title, then description, then location.
 */
export function matchCourse(
  text: { title?: string | null; description?: string | null; location?: string | null },
  courses: CourseMatchable[],
): CourseMatchable | null {
  const active = courses.filter((c) => c.status === 'active' && !c.deletedAt);
  for (const field of [text.title, text.description, text.location]) {
    if (!field) continue;
    let best: { c: CourseMatchable; len: number } | null = null;
    for (const c of active) {
      for (const tok of courseTokens(c)) {
        // Single-letter names ("C") only match in the title to avoid noise.
        if (tok.length < 2 && field !== text.title) continue;
        if (wordRegex(tok).test(field) && (!best || tok.length > best.len)) best = { c, len: tok.length };
      }
    }
    if (best) return best.c;
  }
  return null;
}
