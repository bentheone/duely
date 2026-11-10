import * as chrono from 'chrono-node';
import { courseTokens, escapeRegex } from './match';
import { DAY, tzOffsetMinutes, zonedTime } from './time';
import { DEFAULT_TIMEZONE, EXAM_TYPE_LABELS } from './constants';
import type { Course } from './types';

export type SpanKind = 'course' | 'date' | 'kind' | 'submission' | 'exam';
export interface ParseSpan {
  start: number;
  end: number;
  kind: SpanKind;
  text: string;
}

export type ExamTypeValue = keyof typeof EXAM_TYPE_LABELS;
export type SubmissionValue = 'moodle' | 'email' | 'printed' | 'in_class' | 'other';

export interface ParseResult {
  courseId?: string;
  title: string;
  dueAt?: number;
  /** True when the time part was given explicitly (else the 23:59 default was applied). */
  hasTime?: boolean;
  kind?: 'individual' | 'group';
  submission?: SubmissionValue;
  isExam: boolean;
  examType?: ExamTypeValue;
  spans: ParseSpan[];
}

type ParseCourse = Pick<Course, 'id' | 'shortName' | 'code' | 'matchRules' | 'status' | 'deletedAt' | 'title'>;

export interface ParseOptions {
  now?: number;
  timezone?: string;
}

const ASSIGNMENT_NOUNS =
  'report|project|essay|paper|presentation|submission|draft|assignment|homework|hw|lab|proposal|review|chapter|slides|code|program|design';

interface KeywordRule {
  re: RegExp;
  kind: SpanKind;
  apply: (r: ParseResult, match: string) => void;
}

const examType = (t: ExamTypeValue) => (r: ParseResult) => {
  r.isExam = true;
  if (!r.examType || r.examType === 'other') r.examType = t;
};

const KEYWORDS: KeywordRule[] = [
  { re: /(?<![a-z0-9])(?:group|team|grp)(?![a-z0-9])/gi, kind: 'kind', apply: (r) => (r.kind = 'group') },
  { re: /(?<![a-z0-9])(?:individual|solo|indiv)(?![a-z0-9])/gi, kind: 'kind', apply: (r) => (r.kind = 'individual') },
  { re: /(?<![a-z0-9])(?:on\s+|via\s+|through\s+)?moodle(?![a-z0-9])/gi, kind: 'submission', apply: (r) => (r.submission = 'moodle') },
  { re: /(?<![a-z0-9])(?:by\s+|via\s+)?e-?mail(?:ed)?(?![a-z0-9])/gi, kind: 'submission', apply: (r) => (r.submission = 'email') },
  { re: /(?<![a-z0-9])(?:printed|print(?:\s+out)?|hard\s*copy)(?![a-z0-9])/gi, kind: 'submission', apply: (r) => (r.submission = 'printed') },
  { re: /(?<![a-z0-9])in[\s-]class(?![a-z0-9])/gi, kind: 'submission', apply: (r) => (r.submission = 'in_class') },
  { re: /(?<![a-z0-9])quiz(?:zes)?(?![a-z0-9])/gi, kind: 'exam', apply: examType('quiz') },
  { re: /(?<![a-z0-9])cats?(?![a-z0-9])/gi, kind: 'exam', apply: examType('cat') },
  { re: /(?<![a-z0-9])mid[\s-]?(?:term|sem(?:ester)?)s?(?![a-z0-9])/gi, kind: 'exam', apply: examType('midterm') },
  {
    re: new RegExp(`(?<![a-z0-9])mid(?![a-z0-9])(?!\\s+(?:${ASSIGNMENT_NOUNS})\\b)`, 'gi'),
    kind: 'exam',
    apply: examType('midterm'),
  },
  {
    re: new RegExp(`(?<![a-z0-9])finals?(?![a-z0-9])(?!\\s+(?:${ASSIGNMENT_NOUNS})\\b)`, 'gi'),
    kind: 'exam',
    apply: examType('final'),
  },
  { re: /(?<![a-z0-9])(?:exam|exams|test)(?![a-z0-9])/gi, kind: 'exam', apply: examType('other') },
];

const EDGE_WORDS = /^(?:due|by|on|at|for|before|until|till|the|-|–|—|·|,|:)$/i;

function mask(s: string, start: number, end: number): string {
  return s.slice(0, start) + ' '.repeat(end - start) + s.slice(end);
}

/** §10 smart quick-add parser. Pure, offline. */
export function parseQuickAdd(
  input: string,
  courses: ParseCourse[],
  opts: ParseOptions = {},
): ParseResult {
  const now = opts.now ?? Date.now();
  const tz = opts.timezone ?? DEFAULT_TIMEZONE;
  const result: ParseResult = { title: '', isExam: false, spans: [] };
  let work = input;

  // 1. Course — longest token match among active courses.
  const active = courses.filter((c) => c.status === 'active' && !c.deletedAt);
  let best: { c: ParseCourse; start: number; end: number } | null = null;
  for (const c of active) {
    for (const tok of courseTokens(c)) {
      const re = new RegExp(`(?<![a-z0-9])${escapeRegex(tok)}(?![a-z0-9+#])`, 'i');
      const m = re.exec(work);
      if (m && (!best || m[0].length > best.end - best.start)) {
        best = { c, start: m.index, end: m.index + m[0].length };
      }
    }
  }
  if (best) {
    result.courseId = best.c.id;
    result.spans.push({ start: best.start, end: best.end, kind: 'course', text: input.slice(best.start, best.end) });
    work = mask(work, best.start, best.end);
  }

  // 2. Keywords.
  for (const rule of KEYWORDS) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(work))) {
      rule.apply(result, m[0]);
      result.spans.push({ start: m.index, end: m.index + m[0].length, kind: rule.kind, text: input.slice(m.index, m.index + m[0].length) });
      work = mask(work, m.index, m.index + m[0].length);
      rule.re.lastIndex = m.index + m[0].length;
    }
  }

  // 3. Date / time (chrono, forward-dated, in the user's timezone).
  const offset = tzOffsetMinutes(tz, now);
  const parsed = chrono.parse(work, { instant: new Date(now), timezone: offset }, { forwardDate: true });
  const first = parsed[0];
  if (first) {
    const s = first.start;
    const y = s.get('year')!;
    const mo = s.get('month')!;
    const d = s.get('day')!;
    const hasTime = s.isCertain('hour');
    let due = hasTime
      ? zonedTime(tz, y, mo, d, s.get('hour') ?? 0, s.get('minute') ?? 0)
      : zonedTime(tz, y, mo, d, 23, 59);
    // Weekday-only expressions always point forward ("fri" on a Friday evening = next Friday).
    if (due <= now && s.isCertain('weekday') && !s.isCertain('day')) due += 7 * DAY;
    result.dueAt = due;
    result.hasTime = hasTime;
    result.spans.push({ start: first.index, end: first.index + first.text.length, kind: 'date', text: input.slice(first.index, first.index + first.text.length) });
    work = mask(work, first.index, first.index + first.text.length);
  }

  // 4. Title = what's left.
  const words = work.split(/\s+/).filter(Boolean);
  while (words.length && EDGE_WORDS.test(words[0]!)) words.shift();
  while (words.length && EDGE_WORDS.test(words[words.length - 1]!)) words.pop();
  let title = words.join(' ').replace(/\s+([,.;:])/g, '$1').replace(/[,;:]+$/, '').trim();
  if (title) title = title[0]!.toUpperCase() + title.slice(1);
  if (!title && result.isExam) title = EXAM_TYPE_LABELS[result.examType ?? 'other'];
  result.title = title;
  if (result.isExam) {
    result.examType = result.examType ?? 'other';
    delete result.kind;
    delete result.submission;
    result.spans = result.spans.filter((sp) => sp.kind !== 'kind' && sp.kind !== 'submission');
  }
  result.spans.sort((a, b) => a.start - b.start);
  return result;
}

/** UI colour role per span (§10: course = orange, date = blue, kind = teal). */
export const SPAN_COLORS: Record<SpanKind, { light: string; dark: string }> = {
  course: { light: '#EA580C', dark: '#F97316' },
  date: { light: '#2563EB', dark: '#60A5FA' },
  kind: { light: '#0D9488', dark: '#2DD4BF' },
  submission: { light: '#0D9488', dark: '#2DD4BF' },
  exam: { light: '#7C3AED', dark: '#A855F7' },
};
