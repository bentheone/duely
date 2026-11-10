import { MINUTE, parseHHMM, zonedDayAt } from './time';
import type { Interval } from './types';

export interface SlotFinderInput {
  busy: Interval[];
  /** Earliest time a slot may start (usually now, rounded up). */
  from: number;
  /** Nothing may end after this (due time / exam start). */
  before: number;
  workHours: { start: string; end: string };
  tz: string;
  totalMinutes: number;
  preferredMinutes: number;
  minGapMinutes?: number;
  /** Round slot starts up to this many minutes (default 15). */
  roundToMinutes?: number;
}

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** Free gaps per local day within work hours, minus busy, of at least minGap. */
export function freeGaps(input: Omit<SlotFinderInput, 'totalMinutes' | 'preferredMinutes'>): Interval[][] {
  const minGap = (input.minGapMinutes ?? 45) * MINUTE;
  const round = (input.roundToMinutes ?? 15) * MINUTE;
  const busy = mergeIntervals(input.busy);
  const days: Interval[][] = [];
  const { h: sh, m: sm } = parseHHMM(input.workHours.start);
  const { h: eh, m: em } = parseHHMM(input.workHours.end);
  const startStr = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
  const endStr = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;

  for (let d = 0; d < 400; d++) {
    const dayStart = zonedDayAt(input.from, input.tz, d, '00:00');
    if (dayStart >= input.before) break;
    let ws = zonedDayAt(input.from, input.tz, d, startStr);
    let we = zonedDayAt(input.from, input.tz, d, endStr);
    ws = Math.max(ws, input.from);
    we = Math.min(we, input.before);
    if (ws % round !== 0) ws = Math.ceil(ws / round) * round;
    const gaps: Interval[] = [];
    let cursor = ws;
    for (const b of busy) {
      if (b.end <= cursor) continue;
      if (b.start >= we) break;
      if (b.start - cursor >= minGap) gaps.push({ start: cursor, end: b.start });
      cursor = Math.max(cursor, b.end);
      if (cursor % round !== 0) cursor = Math.ceil(cursor / round) * round;
    }
    if (we - cursor >= minGap) gaps.push({ start: cursor, end: we });
    days.push(gaps);
  }
  return days;
}

/**
 * §7.2 free-slot planner: exclude <45 min gaps, prefer gaps ≥ preferred length,
 * spread across days (one session per day per pass), never after `before`.
 */
export function findFreeSlots(input: SlotFinderInput): Interval[] {
  const minGap = (input.minGapMinutes ?? 45) * MINUTE;
  const pref = input.preferredMinutes * MINUTE;
  let remaining = input.totalMinutes * MINUTE;
  const days = freeGaps(input).map((g) => g.map((x) => ({ ...x })));
  const out: Interval[] = [];

  while (remaining > 0) {
    let placedThisPass = false;
    for (const gaps of days) {
      if (remaining <= 0) break;
      if (gaps.length === 0) continue;
      // Prefer the earliest gap that fits a full preferred session, else the largest gap.
      let idx = gaps.findIndex((g) => g.end - g.start >= pref);
      if (idx === -1) {
        idx = 0;
        for (let i = 1; i < gaps.length; i++)
          if (gaps[i]!.end - gaps[i]!.start > gaps[idx]!.end - gaps[idx]!.start) idx = i;
      }
      const g = gaps[idx]!;
      const want = Math.max(Math.min(pref, remaining), minGap);
      const len = Math.min(want, g.end - g.start);
      if (len < minGap) {
        gaps.splice(idx, 1);
        continue;
      }
      out.push({ start: g.start, end: g.start + len });
      remaining -= len;
      placedThisPass = true;
      // Leave a 15-min breather after a session; drop the remainder if too small.
      const nextStart = g.start + len + 15 * MINUTE;
      if (g.end - nextStart >= minGap) g.start = nextStart;
      else gaps.splice(idx, 1);
    }
    if (!placedThisPass) break;
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Number of free gaps (≥ minGap) between from and before — "3 free slots before Thu". */
export function countFreeSlots(input: Omit<SlotFinderInput, 'totalMinutes' | 'preferredMinutes'>): number {
  return freeGaps(input).reduce((n, g) => n + g.length, 0);
}

