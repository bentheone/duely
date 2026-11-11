import {
  COURSE_PALETTE,
  DAY,
  OWNER_SEED,
  defaultMatchRules,
  type Assignment,
  type Course,
  type Exam,
  type Semester,
  type Session,
  type Subtask,
} from '@duely/shared';
import { getRecord, newId, save } from '@/lib/db/repo';
import { snapshot } from '@/lib/db/queries';
import { useApp } from '@/lib/store';
import { pickSemester } from '@/lib/semester';

// ---------- semesters ----------

export function defaultSemesterName(now = new Date()): string {
  const m = now.getMonth();
  const season = m >= 8 ? 'Fall' : m >= 4 ? 'Summer' : 'Spring';
  return `${season} ${now.getFullYear()}`;
}

export function createSemester(name: string, startsOn: string, endsOn: string, explicit = false): Semester {
  const s = save('semesters', { name, startsOn, endsOn, status: 'active' });
  useApp.getState().setActiveSemester(s.id, explicit);
  return s;
}

/** Active semester, creating one if the user has none yet. */
export function ensureSemester(): Semester {
  const snap = snapshot();
  const st = useApp.getState();
  const found = pickSemester(snap.semesters, snap.courses, st.user?.activeSemesterId, st.explicitSemesterId);
  if (found && found.status !== 'archived') return found;
  const y = new Date().getFullYear();
  return createSemester(defaultSemesterName(), `${y}-09-01`, `${y}-12-20`);
}

export function archiveSemester(id: string) {
  save('semesters', { id, status: 'archived' });
  // Archived semester → its courses are finished (drop out of alarms/prompts/Tasks).
  for (const c of snapshot().courses.filter((c) => c.semesterId === id && c.status === 'active')) finishCourse(c.id);
  const next = snapshot().semesters.find((s) => s.status === 'active' && s.id !== id);
  useApp.getState().setActiveSemester(next?.id ?? null);
}

// ---------- courses ----------

export function nextColor(): string {
  const used = new Set(snapshot().courses.filter((c) => c.status === 'active').map((c) => c.color.toUpperCase()));
  return (COURSE_PALETTE.find((p) => !used.has(p.light.toUpperCase())) ?? COURSE_PALETTE[0]).light;
}

export function upsertCourse(patch: Partial<Course> & { shortName: string }): Course {
  const existing = patch.id ? getRecord('courses', patch.id) : null;
  const semesterId = patch.semesterId ?? existing?.semesterId ?? ensureSemester().id;
  const code = patch.code ?? existing?.code ?? '';
  const title = patch.title ?? existing?.title ?? patch.shortName;
  const rules = patch.matchRules ?? existing?.matchRules ?? [];
  const merged = [...new Set([...defaultMatchRules({ code, shortName: patch.shortName, title }), ...rules])];
  return save('courses', {
    status: 'active',
    color: nextColor(),
    lecturer: null,
    room: null,
    group: null,
    finishedAt: null,
    ...existing,
    ...patch,
    semesterId,
    code,
    title,
    matchRules: merged,
  });
}

export function finishCourse(id: string) {
  save('courses', { id, status: 'finished', finishedAt: Date.now() });
}
export function reopenCourse(id: string) {
  save('courses', { id, status: 'active', finishedAt: null });
}

export function addMatchRule(courseId: string, rule: string) {
  const c = getRecord('courses', courseId);
  if (!c) return;
  const r = rule.trim().toLowerCase();
  if (!r || c.matchRules.includes(r)) return;
  save('courses', { id: courseId, matchRules: [...c.matchRules, r] });
}

/** Owner seed (§11.3), offered on first run. */
export function seedOwnerCourses(): Course[] {
  const snap = snapshot();
  let sem = snap.semesters.find((s) => s.name === OWNER_SEED.semester.name);
  if (!sem) sem = createSemester(OWNER_SEED.semester.name, OWNER_SEED.semester.startsOn, OWNER_SEED.semester.endsOn);
  else useApp.getState().setActiveSemester(sem.id);
  const out: Course[] = [];
  for (const c of OWNER_SEED.courses) {
    const exists = snap.courses.find((x) => x.semesterId === sem!.id && x.code === c.code);
    if (exists) {
      out.push(exists);
      continue;
    }
    out.push(
      upsertCourse({
        semesterId: sem.id,
        shortName: c.shortName,
        code: c.code,
        title: c.shortName,
        color: c.color,
        room: 'room' in c ? c.room : null,
      }),
    );
  }
  return out;
}

/** Turns a timetable event title into a course suggestion: "INSY 8311 Database Programming (F)". */
export function courseFromEventTitle(title: string): { code: string; shortName: string; title: string } {
  const m = /([A-Z]{3,5})\s?-?(\d{3,4})/.exec(title);
  const code = m ? `${m[1]} ${m[2]}` : '';
  const rest = title.replace(m?.[0] ?? '', '').replace(/[-–·|:()]+/g, ' ').replace(/\s+/g, ' ').trim();
  const shortName = (rest.split(' ').slice(0, 2).join(' ') || code || title).slice(0, 16);
  return { code, shortName, title: rest || title };
}

// ---------- assignments ----------

export function createAssignment(p: Partial<Assignment> & { courseId: string; title: string }): Assignment {
  const course = getRecord('courses', p.courseId);
  return save('assignments', {
    notes: '',
    links: [],
    dueAt: null,
    kind: 'individual',
    submission: 'moodle',
    status: 'not_started',
    progressMode: 'auto',
    progressManual: null,
    group: null,
    reminderOffsets: null,
    keepOffline: null,
    googleTaskId: null,
    marks: null,
    grade: null,
    ...p,
    semesterId: course?.semesterId ?? ensureSemester().id,
  });
}

export function setStatus(id: string, status: Assignment['status']) {
  save('assignments', { id, status });
}

export function addSubtask(assignmentId: string, title: string, dueAt: number | null = null): Subtask {
  const existing = snapshot().subtasks.filter((s) => s.assignmentId === assignmentId);
  const order = existing.reduce((m, s) => Math.max(m, s.order), 0) + 1;
  const sub = save('subtasks', { assignmentId, title, dueAt, done: false, order, googleTaskId: null });
  const a = getRecord('assignments', assignmentId);
  if (a?.status === 'not_started') setStatus(assignmentId, 'in_progress');
  return sub;
}

export function toggleSubtask(s: Subtask) {
  save('subtasks', { id: s.id, done: !s.done });
  const a = getRecord('assignments', s.assignmentId);
  if (a && !s.done && a.status === 'not_started') setStatus(a.id, 'in_progress');
}

export function logMissed(courseId: string, answer: 'added' | 'none' | 'later', classSessionId?: string | null) {
  save('missedChecks', { courseId, classSessionId: classSessionId || null, answer, at: Date.now() });
}

// ---------- exams ----------

export function createExam(p: Partial<Exam> & { courseId: string; startsAt: number; type: Exam['type'] }): Exam {
  const course = getRecord('courses', p.courseId);
  return save('exams', {
    durationMin: null,
    room: null,
    topics: [],
    notes: '',
    ...p,
    semesterId: course?.semesterId ?? ensureSemester().id,
  });
}

// ---------- sessions ----------

export function confirmSession(s: Omit<Session, 'userId' | 'rev' | 'createdAt' | 'updatedAt' | 'deletedAt'> & Partial<Session>): Session {
  return save('sessions', { ...s, id: s.id ?? newId(), status: 'confirmed', googleEventId: s.googleEventId ?? null });
}

export function addManualSession(p: { assignmentId?: string; examId?: string; title: string; start: number; minutes: number }): Session {
  return save('sessions', {
    kind: p.examId ? 'study' : 'work',
    assignmentId: p.assignmentId ?? null,
    examId: p.examId ?? null,
    title: p.title,
    start: p.start,
    end: p.start + p.minutes * 60_000,
    status: 'confirmed',
    googleEventId: null,
  });
}

export const WEEK = 7 * DAY;
