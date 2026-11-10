/** Timezone helpers that work with plain epoch-ms numbers and Intl (Hermes + Node). */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(t: number, tz: string): ZonedParts {
  const parts = formatter(tz).formatToParts(new Date(t));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WD[get('weekday')] ?? 0,
  };
}

/** Offset (minutes east of UTC) of `tz` at instant `t`. */
export function tzOffsetMinutes(tz: string, t: number): number {
  const p = zonedParts(t, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(t / 1000) * 1000) / MINUTE);
}

/** Epoch ms for wall-clock time in tz. */
export function zonedTime(
  tz: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = tzOffsetMinutes(tz, guess);
  const t1 = guess - off1 * MINUTE;
  const off2 = tzOffsetMinutes(tz, t1);
  return off1 === off2 ? t1 : guess - off2 * MINUTE;
}

export function parseHHMM(s: string): { h: number; m: number } {
  const [h, m] = s.split(':').map(Number);
  return { h: h || 0, m: m || 0 };
}

/** Start of the local day containing t. */
export function startOfZonedDay(t: number, tz: string): number {
  const p = zonedParts(t, tz);
  return zonedTime(tz, p.year, p.month, p.day);
}

/** Local day + n days, at HH:MM. */
export function zonedDayAt(t: number, tz: string, addDays: number, hhmm: string): number {
  const p = zonedParts(t, tz);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + addDays));
  const { h, m } = parseHHMM(hhmm);
  return zonedTime(tz, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, m);
}

export function dayKey(t: number, tz: string): string {
  const p = zonedParts(t, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function formatHHMM(t: number, tz: string): string {
  const p = zonedParts(t, tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Parses ISO-8601 durations like P3D, PT2H, PT30M, P1DT2H → ms. Returns null if invalid. */
export function parseIsoDuration(s: string): { days: number; ms: number } | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(s);
  if (!m || s === 'P' || s === 'PT') return null;
  const days = Number(m[1] ?? 0);
  const ms = Number(m[2] ?? 0) * HOUR + Number(m[3] ?? 0) * MINUTE;
  return { days, ms };
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
export const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Fri 14 Nov" */
export function formatShortDate(t: number, tz: string): string {
  const p = zonedParts(t, tz);
  return `${WEEKDAY_SHORT[p.weekday]} ${p.day} ${MONTH_SHORT[p.month - 1]}`;
}

/** Relative due label: "Today 17:00", "Tomorrow", "Fri 17:00", "14 Nov". */
export function formatDue(t: number, now: number, tz: string): string {
  const days = Math.round((startOfZonedDay(t, tz) - startOfZonedDay(now, tz)) / DAY);
  const time = formatHHMM(t, tz);
  const timeSuffix = time === '23:59' ? '' : ` ${time}`;
  if (days === 0) return `Today${timeSuffix}`;
  if (days === 1) return `Tomorrow${timeSuffix}`;
  if (days === -1) return `Yesterday`;
  const p = zonedParts(t, tz);
  if (days > 1 && days < 7) return `${WEEKDAY_SHORT[p.weekday]}${timeSuffix}`;
  return `${p.day} ${MONTH_SHORT[p.month - 1]}`;
}
