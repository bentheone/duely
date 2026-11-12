import { DAY, dayKey, uuidv7, zonedDayAt, zonedParts, type ClassSlot } from '@duely/shared';
import { ClassSessionModel, CourseModel, SemesterModel, UserModel, reserveRevs } from '../db/models';

export const DUELY_SOURCE = 'duely';
const MAX_DAYS = 26 * 7;

const slotKey = (courseId: string, day: string, slot: ClassSlot) => `${DUELY_SOURCE}:${courseId}:${day}:${slot.start}`;

/** Class sessions for a weekly schedule between two instants (pure; exported for tests). */
export function expandSchedule(
  courseId: string,
  slots: ClassSlot[],
  from: number,
  to: number,
  tz: string,
  defaultRoom: string | null,
): { googleEventId: string; start: number; end: number; room: string | null }[] {
  const out: { googleEventId: string; start: number; end: number; room: string | null }[] = [];
  for (let i = 0; i <= MAX_DAYS; i++) {
    const day = zonedDayAt(from, tz, i, '00:00');
    if (day > to) break;
    const weekday = zonedParts(day, tz).weekday;
    for (const slot of slots) {
      if (slot.weekday !== weekday) continue;
      const start = zonedDayAt(day, tz, 0, slot.start);
      let end = zonedDayAt(day, tz, 0, slot.end);
      if (end <= start) end = start + 60 * 60_000;
      if (end < from || start > to) continue;
      out.push({ googleEventId: slotKey(courseId, dayKey(day, tz), slot), start, end, room: slot.room || defaultRoom });
    }
  }
  return out;
}

const dateMs = (isoDay: string | undefined, tz: string, fallback: number) => {
  if (!isoDay || !/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return fallback;
  return zonedDayAt(Date.UTC(+isoDay.slice(0, 4), +isoDay.slice(5, 7) - 1, +isoDay.slice(8, 10), 12), tz, 0, '00:00');
};

/**
 * Class times typed into Duely (course.schedule) become server-written class sessions
 * (sourceCalendarId 'duely'), so Today, alarms, widgets and lecture reminders treat them like
 * timetable classes. Past sessions are kept (lectures link to them); the future is rebuilt.
 */
export async function rebuildScheduledClasses(userId: string, courseIds: string[], semesterIds: string[] = []): Promise<void> {
  const courses = (await CourseModel.find({
    userId,
    $or: [{ _id: { $in: courseIds } }, { semesterId: { $in: semesterIds } }],
  }).lean()) as Record<string, unknown>[];
  if (!courses.length) return;
  const user = await UserModel.findById(userId, { timezone: 1 }).lean();
  const tz = user?.timezone ?? 'Africa/Kigali';
  const now = Date.now();
  const windowStart = now - DAY;

  for (const c of courses) {
    const courseId = String(c._id);
    const sem = (await SemesterModel.findOne({ _id: c.semesterId, userId }).lean()) as Record<string, unknown> | null;
    const slots = Array.isArray(c.schedule) ? (c.schedule as ClassSlot[]) : [];
    const live = !c.deletedAt && c.status === 'active' && slots.length > 0 && !!sem && !sem.deletedAt;
    const from = Math.max(windowStart, dateMs(sem?.startsOn as string | undefined, tz, windowStart));
    const to = Math.min(now + MAX_DAYS * DAY, dateMs(sem?.endsOn as string | undefined, tz, now + 120 * DAY) + DAY - 1);
    const wanted = live ? expandSchedule(courseId, slots, from, to, tz, (c.room as string | null) ?? null) : [];

    const existing = await ClassSessionModel.find({ userId, courseId, sourceCalendarId: DUELY_SOURCE, deletedAt: null, start: { $gte: windowStart } }).lean();
    const byKey = new Map(existing.map((e) => [String(e.googleEventId), e]));
    const wantedKeys = new Set(wanted.map((w) => w.googleEventId));

    const inserts = wanted.filter((w) => !byKey.has(w.googleEventId));
    const updates = wanted.filter((w) => {
      const e = byKey.get(w.googleEventId);
      return e && (e.end !== w.end || (e.room ?? null) !== w.room);
    });
    const deletes = existing.filter((e) => !wantedKeys.has(String(e.googleEventId)));
    const n = inserts.length + updates.length + deletes.length;
    if (!n) continue;
    let rev = await reserveRevs(userId, n);
    const ts = Date.now();
    if (inserts.length) {
      await ClassSessionModel.insertMany(
        inserts.map((w) => ({ _id: uuidv7(), userId, courseId, sourceCalendarId: DUELY_SOURCE, ...w, createdAt: ts, updatedAt: ts, deletedAt: null, rev: rev++ })),
      );
    }
    for (const w of updates) {
      await ClassSessionModel.updateOne({ _id: byKey.get(w.googleEventId)!._id, userId }, { $set: { end: w.end, room: w.room, updatedAt: ts, rev: rev++ } });
    }
    for (const e of deletes) {
      await ClassSessionModel.updateOne({ _id: e._id, userId }, { $set: { deletedAt: ts, updatedAt: ts, rev: rev++ } });
    }
  }
}
