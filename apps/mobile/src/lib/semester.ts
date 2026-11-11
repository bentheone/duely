import type { Course, Semester } from '@duely/shared';

/**
 * Which semester the app shows. The stored choice wins when it has courses or the user picked it on
 * purpose. Otherwise (e.g. an empty semester auto-created on a fresh install before the first pull),
 * fall back to the semester that actually holds the user's active courses — so Courses, Assignments
 * and Exams never go blank while Today still shows everything.
 */
export function pickSemester(semesters: Semester[], courses: Course[], activeId: string | null | undefined, explicitId: string | null | undefined): Semester | null {
  const live = semesters.filter((s) => !s.deletedAt);
  const chosen = live.find((s) => s.id === activeId);
  const courseCount = (id: string) => courses.filter((c) => c.semesterId === id && !c.deletedAt).length;
  if (chosen && (courseCount(chosen.id) > 0 || chosen.id === explicitId)) return chosen;

  // Semester holding the most recently touched active course.
  let best: Semester | null = null;
  let bestAt = -1;
  for (const c of courses) {
    if (c.deletedAt || c.status !== 'active') continue;
    const s = live.find((x) => x.id === c.semesterId && x.status !== 'archived');
    if (s && c.updatedAt > bestAt) {
      best = s;
      bestAt = c.updatedAt;
    }
  }
  return best ?? chosen ?? [...live].reverse().find((s) => s.status === 'active') ?? live[live.length - 1] ?? null;
}
