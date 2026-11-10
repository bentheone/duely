import { useMemo } from 'react';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import type {
  Assignment,
  ClassSession,
  Course,
  Exam,
  FileAttachment,
  MissedCheckLog,
  Semester,
  Session,
  Subtask,
} from '@duely/shared';
import { getDb } from './client';
import * as s from './schema';
import { useApp } from '../store';

/** Reactive reads straight from SQLite (§6: UI reads only SQLite). Data sets are small; filter in JS. */
function useRows<T>(query: Parameters<typeof useLiveQuery>[0], deps: unknown[] = []): T[] {
  const { data } = useLiveQuery(query, deps);
  return (data as unknown as T[]) ?? [];
}

export function useSemesters(): Semester[] {
  const db = getDb();
  return useRows<Semester>(db.select().from(s.semesters).where(isNull(s.semesters.deletedAt)).orderBy(asc(s.semesters.startsOn)));
}

export function useActiveSemester(): Semester | null {
  const semesters = useSemesters();
  const activeId = useApp((st) => st.user?.activeSemesterId);
  return useMemo(
    () =>
      semesters.find((x) => x.id === activeId) ??
      [...semesters].reverse().find((x) => x.status === 'active') ??
      semesters[semesters.length - 1] ??
      null,
    [semesters, activeId],
  );
}

export function useAllCourses(): Course[] {
  const db = getDb();
  return useRows<Course>(db.select().from(s.courses).where(isNull(s.courses.deletedAt)).orderBy(asc(s.courses.shortName)));
}

/** Courses of the active semester. `active` = not finished (finished drop out of filters, alarms, prompts). */
export function useCourses(): { active: Course[]; finished: Course[]; byId: Map<string, Course> } {
  const all = useAllCourses();
  const sem = useActiveSemester();
  return useMemo(() => {
    const inSem = all.filter((c) => !sem || c.semesterId === sem.id);
    return {
      active: inSem.filter((c) => c.status === 'active'),
      finished: inSem.filter((c) => c.status === 'finished'),
      byId: new Map(all.map((c) => [c.id, c])),
    };
  }, [all, sem]);
}

export function useAssignments(): Assignment[] {
  const db = getDb();
  return useRows<Assignment>(db.select().from(s.assignments).where(isNull(s.assignments.deletedAt)).orderBy(asc(s.assignments.dueAt)));
}

export function useAssignment(id: string | undefined): Assignment | null {
  const db = getDb();
  const rows = useRows<Assignment>(db.select().from(s.assignments).where(eq(s.assignments.id, id ?? '')), [id]);
  return rows[0] ?? null;
}

export function useSubtasks(assignmentId?: string): Subtask[] {
  const db = getDb();
  const q = assignmentId
    ? db.select().from(s.subtasks).where(and(eq(s.subtasks.assignmentId, assignmentId), isNull(s.subtasks.deletedAt))).orderBy(asc(s.subtasks.order))
    : db.select().from(s.subtasks).where(isNull(s.subtasks.deletedAt));
  return useRows<Subtask>(q, [assignmentId]);
}

export function useExams(): Exam[] {
  const db = getDb();
  return useRows<Exam>(db.select().from(s.exams).where(isNull(s.exams.deletedAt)).orderBy(asc(s.exams.startsAt)));
}

export function useExam(id: string | undefined): Exam | null {
  const db = getDb();
  return useRows<Exam>(db.select().from(s.exams).where(eq(s.exams.id, id ?? '')), [id])[0] ?? null;
}

export function useSessions(): Session[] {
  const db = getDb();
  return useRows<Session>(db.select().from(s.sessions).where(isNull(s.sessions.deletedAt)).orderBy(asc(s.sessions.start)));
}

export function useClassSessions(): ClassSession[] {
  const db = getDb();
  return useRows<ClassSession>(db.select().from(s.classSessions).where(isNull(s.classSessions.deletedAt)).orderBy(asc(s.classSessions.start)));
}

export function useFiles(ownerType: 'assignment' | 'exam', ownerId: string | undefined): FileAttachment[] {
  const db = getDb();
  return useRows<FileAttachment>(
    db
      .select()
      .from(s.files)
      .where(and(eq(s.files.ownerType, ownerType), eq(s.files.ownerId, ownerId ?? ''), isNull(s.files.deletedAt))),
    [ownerType, ownerId],
  );
}

export function useMissedChecks(): MissedCheckLog[] {
  const db = getDb();
  return useRows<MissedCheckLog>(db.select().from(s.missedChecks).where(isNull(s.missedChecks.deletedAt)));
}

export function useFileCache(): Map<string, { localUri: string; safUri: string | null }> {
  const db = getDb();
  const rows = useRows<{ attachmentId: string; localUri: string; safUri: string | null }>(db.select().from(s.fileCache));
  return useMemo(() => new Map(rows.map((r) => [r.attachmentId, r])), [rows]);
}

// ---- non-reactive snapshots (notifications, alarms, widgets) ----

export function snapshot() {
  const db = getDb();
  return {
    semesters: db.select().from(s.semesters).where(isNull(s.semesters.deletedAt)).all() as unknown as Semester[],
    courses: db.select().from(s.courses).where(isNull(s.courses.deletedAt)).all() as unknown as Course[],
    assignments: db.select().from(s.assignments).where(isNull(s.assignments.deletedAt)).all() as unknown as Assignment[],
    subtasks: db.select().from(s.subtasks).where(isNull(s.subtasks.deletedAt)).all() as unknown as Subtask[],
    exams: db.select().from(s.exams).where(isNull(s.exams.deletedAt)).all() as unknown as Exam[],
    sessions: db.select().from(s.sessions).where(isNull(s.sessions.deletedAt)).all() as unknown as Session[],
    classSessions: db.select().from(s.classSessions).where(isNull(s.classSessions.deletedAt)).all() as unknown as ClassSession[],
    missedChecks: db.select().from(s.missedChecks).where(isNull(s.missedChecks.deletedAt)).all() as unknown as MissedCheckLog[],
    files: db.select().from(s.files).where(isNull(s.files.deletedAt)).all() as unknown as FileAttachment[],
  };
}
