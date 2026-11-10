import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CLASS_SESSION_HORIZON_DAYS,
  DAY,
  SUBMISSION_LABELS,
  closestGoogleColorId,
  formatHHMM,
  matchCourse,
  uuidv7,
  zonedParts,
  type Assignment,
  type ClassSession,
  type Course,
  type GoogleSyncSummary,
  type Session,
  type Subtask,
} from '@duely/shared';
import {
  AssignmentModel,
  ClassSessionModel,
  CourseModel,
  IntegrationAccountModel,
  SessionModel,
  SubtaskModel,
  UserModel,
  serverInsert,
  serverUpdate,
  toRecord,
  type IntegrationAccountDoc,
} from '../db/models';
import { GOOGLE_API_FACTORY, type GEvent, type GoogleApi, type GoogleApiFactory } from './google.client';

export const DUELY_CALENDAR_NAME = 'Duely';
export const TASK_LIST_NAME = 'School';
const MIN_INTERVAL_MS = 5 * 60 * 1000;
const CLOSED = new Set(['done', 'submitted', 'graded']);

const rec = <T>(d: unknown) => toRecord<T>(d as Record<string, unknown>)!;

@Injectable()
export class GoogleSyncService {
  private readonly log = new Logger('GoogleSync');
  constructor(@Inject(GOOGLE_API_FACTORY) private readonly factory: GoogleApiFactory) {}

  async account(userId: string): Promise<IntegrationAccountDoc | null> {
    return IntegrationAccountModel.findOne({ userId }).lean();
  }

  api(acc: IntegrationAccountDoc): GoogleApi {
    return this.factory.forAccount(acc);
  }

  /** POST /integrations/google/sync — calendar + tasks two-way (§7.2, §7.3). */
  async sync(userId: string, force = false): Promise<GoogleSyncSummary> {
    const summary: GoogleSyncSummary = {
      classSessions: 0,
      unmatchedEvents: [],
      sessionsWritten: 0,
      sessionsPulled: 0,
      tasksPushed: 0,
      tasksCompletedFromGoogle: 0,
    };
    const acc = await this.account(userId);
    if (!acc?.refreshTokenEnc) return { ...summary, skipped: 'google-not-connected' };
    const startedAt = Date.now();
    if (!force && acc.lastSyncAt && startedAt - acc.lastSyncAt < MIN_INTERVAL_MS) {
      return { ...summary, skipped: 'debounced' };
    }
    const user = await UserModel.findById(userId).lean();
    const tz = user?.timezone ?? 'Africa/Kigali';
    const api = this.api(acc);
    const courses = (await CourseModel.find({ userId, deletedAt: null }).lean()).map((c) => rec<Course>(c));

    await this.syncTimetable(userId, acc, api, courses, summary);
    await this.syncDuelyCalendar(userId, acc, api, courses, tz, summary);
    await this.syncTasks(userId, acc, api, courses, tz, summary);

    await IntegrationAccountModel.updateOne({ _id: acc._id }, { $set: { lastSyncAt: startedAt } });
    return summary;
  }

  // ---------- Timetable → ClassSession cache (21 days) ----------

  async syncTimetable(
    userId: string,
    acc: IntegrationAccountDoc,
    api: GoogleApi,
    courses: Course[],
    summary: GoogleSyncSummary,
  ): Promise<void> {
    if (!acc.timetableCalendarIds.length) return;
    const now = Date.now();
    const from = now - DAY; // keep today's earlier classes for the Today screen
    const to = now + CLASS_SESSION_HORIZON_DAYS * DAY;
    const seen = new Set<string>();
    const unmatched = new Map<string, GoogleSyncSummary['unmatchedEvents'][number]>();
    const existing = await ClassSessionModel.find({ userId, deletedAt: null }).lean();
    const byEvent = new Map(existing.map((e) => [String(e.googleEventId), rec<ClassSession>(e)]));

    for (const calId of acc.timetableCalendarIds) {
      const events = await api.listEvents(calId, from, to);
      for (const ev of events) {
        if (ev.status === 'cancelled' || ev.start == null || ev.end == null) continue;
        const course = matchCourse({ title: ev.summary, description: ev.description, location: ev.location }, courses);
        if (!course) {
          const key = ev.recurringEventId ?? ev.id;
          if (!unmatched.has(key) && ev.summary)
            unmatched.set(key, { eventId: key, title: ev.summary, calendarId: calId, recurring: !!ev.recurringEventId });
          continue;
        }
        seen.add(ev.id);
        const prev = byEvent.get(ev.id);
        const fields = {
          courseId: course.id,
          googleEventId: ev.id,
          start: ev.start,
          end: ev.end,
          room: ev.location ?? null,
          sourceCalendarId: calId,
        };
        if (!prev) {
          await serverInsert('classSessions', userId, { id: uuidv7(), ...fields });
        } else if (
          prev.start !== fields.start ||
          prev.end !== fields.end ||
          prev.courseId !== fields.courseId ||
          (prev.room ?? null) !== fields.room
        ) {
          await serverUpdate('classSessions', userId, prev.id, fields);
        }
        summary.classSessions++;
      }
    }
    // Anything cached in the window that Google no longer has (or no longer matches) is soft-deleted.
    for (const [eventId, cs] of byEvent) {
      if (!seen.has(eventId) && cs.start >= from) {
        await serverUpdate('classSessions', userId, cs.id, { deletedAt: Date.now() });
      }
    }
    summary.unmatchedEvents = [...unmatched.values()];
  }

  // ---------- Duely calendar ↔ Sessions ----------

  async ensureDuelyCalendar(acc: IntegrationAccountDoc, api: GoogleApi, tz: string): Promise<string> {
    if (acc.duelyCalendarId) return acc.duelyCalendarId;
    const existing = (await api.listCalendars()).find((c) => c.summary === DUELY_CALENDAR_NAME);
    const id = existing?.id ?? (await api.createCalendar(DUELY_CALENDAR_NAME, tz));
    await IntegrationAccountModel.updateOne({ _id: acc._id }, { $set: { duelyCalendarId: id } });
    acc.duelyCalendarId = id;
    return id;
  }

  async syncDuelyCalendar(
    userId: string,
    acc: IntegrationAccountDoc,
    api: GoogleApi,
    courses: Course[],
    tz: string,
    summary: GoogleSyncSummary,
  ): Promise<void> {
    const calId = await this.ensureDuelyCalendar(acc, api, tz);

    // 1. Pull Google-side edits/deletes (incremental with syncToken).
    let r = await api.syncEvents(calId, acc.duelyCalendarSyncToken ?? null, Date.now() - 30 * DAY);
    if (r.tokenExpired) r = await api.syncEvents(calId, null, Date.now() - 30 * DAY);
    for (const ev of r.events) {
      const sid = ev.duelySessionId;
      const s = sid
        ? rec<Session>(await SessionModel.findOne({ _id: sid, userId }).lean())
        : rec<Session>(await SessionModel.findOne({ userId, googleEventId: ev.id }).lean());
      if (!s || !s.id) continue;
      if (ev.status === 'cancelled') {
        if (!s.deletedAt) {
          await serverUpdate('sessions', userId, s.id, { deletedAt: Date.now(), googleEventId: null });
          summary.sessionsPulled++;
        }
        continue;
      }
      if (ev.start != null && ev.end != null && (ev.start !== s.start || ev.end !== s.end)) {
        await serverUpdate('sessions', userId, s.id, { start: ev.start, end: ev.end });
        summary.sessionsPulled++;
      }
    }
    await IntegrationAccountModel.updateOne(
      { _id: acc._id },
      { $set: { duelyCalendarSyncToken: r.nextSyncToken ?? acc.duelyCalendarSyncToken ?? null } },
    );

    // 2. Push local changes.
    const since = acc.lastSyncAt ?? 0;
    const sessions = (
      await SessionModel.find({
        userId,
        $or: [{ googleEventId: { $in: [null, undefined] }, status: 'confirmed', deletedAt: null }, { updatedAt: { $gt: since } }],
      }).lean()
    ).map((s) => rec<Session>(s));
    const courseById = new Map(courses.map((c) => [c.id, c]));
    for (const s of sessions) {
      const live = !s.deletedAt && (s.status === 'confirmed' || s.status === 'done');
      if (!live) {
        if (s.googleEventId) {
          await api.deleteEvent(calId, s.googleEventId);
          await serverUpdate('sessions', userId, s.id, { googleEventId: null });
          summary.sessionsWritten++;
        }
        continue;
      }
      const course = await this.courseForSession(userId, s, courseById);
      const ev: Omit<GEvent, 'id'> = {
        summary: course ? `${course.shortName} · ${s.title}` : s.title,
        description: s.assignmentId ? `duely://assignment/${s.assignmentId}` : s.examId ? `duely://exam/${s.examId}` : null,
        start: s.start,
        end: s.end,
        colorId: course ? closestGoogleColorId(course.color) : null,
        duelySessionId: s.id,
      };
      if (!s.googleEventId) {
        const created = await api.insertEvent(calId, ev, tz);
        await serverUpdate('sessions', userId, s.id, { googleEventId: created.id });
      } else {
        await api.patchEvent(calId, s.googleEventId, ev, tz);
      }
      summary.sessionsWritten++;
    }
  }

  private async courseForSession(userId: string, s: Session, courseById: Map<string, Course>): Promise<Course | null> {
    if (s.assignmentId) {
      const a = await AssignmentModel.findOne({ _id: s.assignmentId, userId }).lean();
      return a ? (courseById.get(String(a.courseId)) ?? null) : null;
    }
    return null;
  }

  // ---------- Google Tasks ↔ Assignments/Subtasks ----------

  async ensureTaskList(acc: IntegrationAccountDoc, api: GoogleApi): Promise<string> {
    if (acc.tasksListId) return acc.tasksListId;
    const existing = (await api.listTaskLists()).find((l) => l.title === TASK_LIST_NAME);
    const id = existing?.id ?? (await api.createTaskList(TASK_LIST_NAME));
    await IntegrationAccountModel.updateOne({ _id: acc._id }, { $set: { tasksListId: id } });
    acc.tasksListId = id;
    return id;
  }

  static taskFields(a: Assignment, course: Course, tz: string) {
    const p = a.dueAt ? zonedParts(a.dueAt, tz) : null;
    // Tasks has no due time (§3.2): RFC3339 midnight of the local due date; time goes in notes.
    const due = p
      ? `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T00:00:00.000Z`
      : null;
    const parts = [
      a.dueAt ? `Due ${formatHHMM(a.dueAt, tz)}` : null,
      a.kind,
      SUBMISSION_LABELS[a.submission].toLowerCase(),
    ].filter(Boolean);
    return {
      title: `${course.shortName} — ${a.title}`,
      due,
      notes: `${parts.join(' · ')}\nduely://assignment/${a.id}`,
      status: CLOSED.has(a.status) ? 'completed' : 'needsAction',
    };
  }

  async syncTasks(
    userId: string,
    acc: IntegrationAccountDoc,
    api: GoogleApi,
    courses: Course[],
    tz: string,
    summary: GoogleSyncSummary,
  ): Promise<void> {
    const listId = await this.ensureTaskList(acc, api);
    const since = acc.lastSyncAt ?? 0;

    // 1. Pull completion changes from Google.
    const remote = await api.listTasks(listId, since || null);
    for (const t of remote) {
      const updated = t.updated ? Date.parse(t.updated) : 0;
      const a = await AssignmentModel.findOne({ userId, googleTaskId: t.id }).lean();
      if (a) {
        const asg = rec<Assignment>(a);
        if (t.deleted) {
          await serverUpdate('assignments', userId, asg.id, { googleTaskId: null });
          continue;
        }
        if (updated <= asg.updatedAt) continue;
        if (t.status === 'completed' && !CLOSED.has(asg.status)) {
          await serverUpdate('assignments', userId, asg.id, { status: 'done' });
          summary.tasksCompletedFromGoogle++;
        } else if (t.status === 'needsAction' && asg.status === 'done') {
          await serverUpdate('assignments', userId, asg.id, { status: 'in_progress' });
        }
        continue;
      }
      const s = await SubtaskModel.findOne({ userId, googleTaskId: t.id }).lean();
      if (s) {
        const sub = rec<Subtask>(s);
        if (t.deleted) {
          await serverUpdate('subtasks', userId, sub.id, { googleTaskId: null });
          continue;
        }
        if (updated <= sub.updatedAt) continue;
        const done = t.status === 'completed';
        if (done !== sub.done) {
          await serverUpdate('subtasks', userId, sub.id, { done });
          if (done) summary.tasksCompletedFromGoogle++;
        }
      }
    }

    // 2. Push assignments of ACTIVE courses (and their subtasks as child tasks).
    const active = new Map(courses.filter((c) => c.status === 'active').map((c) => [c.id, c]));
    const changed = (
      await AssignmentModel.find({
        userId,
        $or: [{ googleTaskId: { $in: [null, undefined] } }, { updatedAt: { $gt: since } }],
      }).lean()
    ).map((a) => rec<Assignment>(a));

    for (const a of changed) {
      const course = active.get(a.courseId);
      if (a.deletedAt) {
        if (a.googleTaskId) {
          await api.deleteTask(listId, a.googleTaskId);
          await serverUpdate('assignments', userId, a.id, { googleTaskId: null });
        }
        continue;
      }
      if (!course) continue; // finished courses are not pushed
      const fields = GoogleSyncService.taskFields(a, course, tz);
      if (!a.googleTaskId) {
        const t = await api.insertTask(listId, fields);
        await serverUpdate('assignments', userId, a.id, { googleTaskId: t.id });
        a.googleTaskId = t.id;
      } else {
        await api.patchTask(listId, a.googleTaskId, fields);
      }
      summary.tasksPushed++;
    }

    const subs = (
      await SubtaskModel.find({
        userId,
        $or: [{ googleTaskId: { $in: [null, undefined] }, deletedAt: null }, { updatedAt: { $gt: since } }],
      }).lean()
    ).map((s) => rec<Subtask>(s));
    for (const s of subs) {
      const parent = rec<Assignment>(await AssignmentModel.findOne({ _id: s.assignmentId, userId }).lean());
      if (s.deletedAt || !parent?.id || parent.deletedAt) {
        if (s.googleTaskId) {
          await api.deleteTask(listId, s.googleTaskId);
          await serverUpdate('subtasks', userId, s.id, { googleTaskId: null });
        }
        continue;
      }
      if (!parent.googleTaskId || !active.has(parent.courseId)) continue;
      const fields = {
        title: s.title,
        due: s.dueAt ? GoogleSyncService.taskFields({ ...parent, dueAt: s.dueAt }, active.get(parent.courseId)!, tz).due : null,
        notes: s.dueAt ? `Due ${formatHHMM(s.dueAt, tz)}` : null,
        status: s.done ? 'completed' : 'needsAction',
      };
      if (!s.googleTaskId) {
        const t = await api.insertTask(listId, fields, parent.googleTaskId);
        await serverUpdate('subtasks', userId, s.id, { googleTaskId: t.id });
      } else {
        await api.patchTask(listId, s.googleTaskId, fields);
      }
      summary.tasksPushed++;
    }
  }
}

