import { darkenForWhiteText } from './color';
import { ALARM_HORIZON_DAYS, type UserSettings } from './constants';
import { DAY, MINUTE, dayKey } from './time';
import type { ClassSession, Course } from './types';

export interface AlarmSpec {
  id: string;
  triggerAt: number;
  title: string;
  subtitle: string;
  color: string;
}

type CourseLite = Pick<Course, 'id' | 'shortName' | 'color' | 'status' | 'deletedAt' | 'room'>;
type SessionLite = Pick<ClassSession, 'id' | 'courseId' | 'start' | 'end' | 'room' | 'deletedAt'>;

/**
 * §8.1 JS side: alarms for every class of an active course in the next 7 days,
 * at start − leadMinutes (or only the first class per local day when !everyClass).
 */
export function computeClassAlarms(
  sessions: SessionLite[],
  courses: CourseLite[],
  alarm: UserSettings['alarm'],
  now: number,
  tz: string,
): AlarmSpec[] {
  if (!alarm.enabled) return [];
  const active = new Map(
    courses.filter((c) => c.status === 'active' && !c.deletedAt).map((c) => [c.id, c]),
  );
  const horizon = now + ALARM_HORIZON_DAYS * DAY;
  const lead = alarm.leadMinutes * MINUTE;
  const candidates = sessions
    .filter((s) => !s.deletedAt && active.has(s.courseId))
    .filter((s) => s.start - lead > now && s.start <= horizon)
    .sort((a, b) => a.start - b.start);

  const seenDays = new Set<string>();
  const out: AlarmSpec[] = [];
  for (const s of candidates) {
    if (!alarm.everyClass) {
      const k = dayKey(s.start, tz);
      if (seenDays.has(k)) continue;
      seenDays.add(k);
    }
    const c = active.get(s.courseId)!;
    const room = s.room ?? c.room;
    out.push({
      id: `class-${s.id}`,
      triggerAt: s.start - lead,
      title: c.shortName,
      subtitle: `in ${alarm.leadMinutes} min${room ? ` · ${room}` : ''}`,
      color: darkenForWhiteText(c.color),
    });
  }
  return out;
}
