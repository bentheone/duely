import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, X } from 'lucide-react-native';
import {
  MINUTE,
  MONTH_LONG,
  WEEKDAY_SHORT,
  dayKey,
  isAssignmentOpen,
  formatHHMM,
  parseHHMM,
  startOfZonedDay,
  tint,
  zonedDayAt,
  zonedParts,
  type Interval,
  type Session,
} from '@duely/shared';
import { Gap, IconButton, PillButton, SmallButton, T } from '@/components/ui';
import { Screen } from '@/components/ui';
import { pickDateTime } from '@/components/pickers';
import { TitleRow } from '@/components/ProfileButton';
import { addManualSession, confirmSession } from '@/features/actions';
import { useAssignments, useClassSessions, useCourses, useExams, useSessions } from '@/lib/db/queries';
import { api } from '@/lib/api';
import { syncNow } from '@/lib/sync/engine';
import { MonthSheet, WeekStrip, mondayOf, type DayMarks } from '@/features/WeekStrip';
import { useApp, useSettings, useTz } from '@/lib/store';
import { useTheme } from '@/lib/theme';

const HOUR_PX = 56;

interface Block {
  key: string;
  start: number;
  end: number;
  title: string;
  sub?: string;
  kind: 'class' | 'busy' | 'session' | 'suggestion' | 'meeting';
  color?: string;
  suggestion?: Session;
  onPress?: () => void;
}

/** §11.3 #7 Calendar / Plan sessions. With ?assignmentId= or ?examId= it shows planner suggestions. */
export default function Calendar() {
  const { assignmentId, examId } = useLocalSearchParams<{ assignmentId?: string; examId?: string }>();
  const planning = !!(assignmentId || examId);
  const { c, scheme, course: courseColor } = useTheme();
  const tz = useTz();
  const settings = useSettings();
  const online = useApp((s) => s.online);
  const classes = useClassSessions();
  const sessions = useSessions();
  const assignments = useAssignments();
  const exams = useExams();
  const { byId, active } = useCourses();
  const now = Date.now();
  const today = startOfZonedDay(now, tz);
  const [selected, setSelected] = useState(today);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [hours, setHours] = useState(Math.max(1, Math.round((settings.sessionDefaultMinutes * 2) / 60)));

  const target = assignmentId ? assignments.find((a) => a.id === assignmentId) : undefined;
  const exam = examId ? exams.find((e) => e.id === examId) : undefined;
  const deadline = target?.dueAt ?? exam?.startsAt ?? null;
  const targetCourse = byId.get(target?.courseId ?? exam?.courseId ?? '');

  const plan = useQuery({
    queryKey: ['planner', assignmentId, examId, hours],
    enabled: planning && online,
    queryFn: () =>
      api<{ suggestions: Session[]; busy: Interval[] }>('/planner/suggest', {
        body: { ...(assignmentId ? { assignmentId } : { examId }), totalMinutes: hours * 60 },
      }),
  });
  const suggestions = (plan.data?.suggestions ?? []).filter((s) => !accepted.has(s.id) && !dismissed.has(s.id));

  useEffect(() => {
    const first = plan.data?.suggestions[0];
    if (first) setSelected(startOfZonedDay(first.start, tz));
  }, [plan.data, tz]);

  const dayEnd = startOfZonedDay(selected + 36 * 3600_000, tz);

  const blocks = useMemo<Block[]>(() => {
    const inDay = (s: number, e: number) => e > selected && s < dayEnd;
    const out: Block[] = [];
    const activeIds = new Set(active.map((x) => x.id));
    for (const cs of classes)
      if (inDay(cs.start, cs.end) && activeIds.has(cs.courseId)) {
        const co = byId.get(cs.courseId);
        out.push({ key: cs.id, start: cs.start, end: cs.end, title: co?.shortName ?? 'Class', sub: cs.room ?? co?.room ?? undefined, kind: 'class', color: co?.color });
      }
    for (const s of sessions)
      if (inDay(s.start, s.end) && (s.status === 'confirmed' || s.status === 'done')) {
        const a = s.assignmentId ? assignments.find((x) => x.id === s.assignmentId) : undefined;
        const ex = s.examId ? exams.find((x) => x.id === s.examId) : undefined;
        const co = byId.get(a?.courseId ?? ex?.courseId ?? '');
        out.push({
          key: s.id,
          start: s.start,
          end: s.end,
          title: s.title,
          sub: co?.shortName,
          kind: 'session',
          color: co?.color,
          onPress: () => router.push(a ? `/assignment/${a.id}` : ex ? `/exam/${ex.id}` : '/calendar'),
        });
      }
    for (const a of assignments)
      for (const m of a.group?.meetings ?? [])
        if (inDay(m.at, m.at + 3600_000)) out.push({ key: `${a.id}-${m.at}`, start: m.at, end: m.at + 3600_000, title: 'Group meeting', sub: m.place ?? a.title, kind: 'meeting', color: byId.get(a.courseId)?.color });
    for (const b of plan.data?.busy ?? [])
      if (inDay(b.start, b.end) && !out.some((x) => x.kind === 'class' && x.start === b.start)) out.push({ key: `busy-${b.start}`, start: b.start, end: b.end, title: 'Busy', kind: 'busy' });
    for (const s of suggestions) if (inDay(s.start, s.end)) out.push({ key: s.id, start: s.start, end: s.end, title: s.title, kind: 'suggestion', suggestion: s });
    return out.sort((x, y) => x.start - y.start);
  }, [classes, sessions, assignments, exams, plan.data, suggestions, selected, dayEnd, byId, active]);

  const ws = parseHHMM(settings.workHours.start).h;
  const firstHour = Math.min(ws, ...blocks.map((b) => zonedParts(Math.max(b.start, selected), tz).hour));
  const lastHour = Math.max(parseHHMM(settings.workHours.end).h, ...blocks.map((b) => zonedParts(Math.min(b.end, dayEnd - 1), tz).hour + 1));
  const top0 = zonedDayAt(selected, tz, 0, `${String(firstHour).padStart(2, '0')}:00`);
  const y = (t: number) => ((t - top0) / (60 * MINUTE)) * HOUR_PX;

  const accept = (s: Session) => {
    confirmSession({ ...s, status: 'confirmed' });
    setAccepted(new Set([...accepted, s.id]));
  };
  // Dots under days with deadlines, exams, group meetings (muted) or planner suggestions (accent).
  const marks = useMemo<DayMarks>(() => {
    const m: DayMarks = new Map();
    const activeIds = new Set(active.map((x) => x.id));
    for (const a of assignments) {
      if (a.dueAt != null && activeIds.has(a.courseId) && isAssignmentOpen(a)) m.set(dayKey(a.dueAt, tz), c.muted);
      for (const mt of a.group?.meetings ?? []) m.set(dayKey(mt.at, tz), c.muted);
    }
    for (const e of exams) if (activeIds.has(e.courseId)) m.set(dayKey(e.startsAt, tz), c.danger);
    for (const s of suggestions) m.set(dayKey(s.start, tz), c.suggestion);
    return m;
  }, [assignments, exams, suggestions, active, tz, c]);
  const [monthOpen, setMonthOpen] = useState(false);
  const thisWeek = mondayOf(selected, tz) === mondayOf(today, tz);

  const deadlineLabel = deadline ? WEEKDAY_SHORT[zonedParts(deadline, tz).weekday] : '';
  const sel = zonedParts(selected, tz);
  const monthTitle = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pick a month"
        onPress={() => setMonthOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}
      >
        <T v="display" numberOfLines={1} style={{ flexShrink: 1 }}>
          {MONTH_LONG[sel.month - 1]}
        </T>
        <ChevronDown size={24} color={c.muted} />
      </Pressable>
      {!thisWeek ? <SmallButton title="Today" onPress={() => setSelected(today)} /> : null}
    </View>
  );

  return (
    <Screen
      back={planning}
      onRefresh={planning ? () => plan.refetch() : () => syncNow()}
      footer={
        planning ? (
          <View style={{ gap: 10 }}>
            <T v="meta" tone="muted" style={{ textAlign: 'center' }}>
              {!online
                ? 'Offline — pick a time yourself'
                : plan.isLoading
                  ? 'Finding free time…'
                  : `${suggestions.length} free ${suggestions.length === 1 ? 'slot' : 'slots'}${deadlineLabel ? ` before ${deadlineLabel}` : ''}`}
            </T>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <SmallButton
                title="Pick myself"
                onPress={async () => {
                  const t = await pickDateTime(Math.max(now + 3600_000, selected + 18 * 3600_000), tz);
                  if (!t) return;
                  addManualSession({ assignmentId, examId, title: target?.title ?? 'Study', start: t, minutes: settings.sessionDefaultMinutes });
                }}
              />
              <PillButton style={{ flex: 1 }} title="Add all" disabled={!suggestions.length} onPress={() => suggestions.forEach(accept)} />
            </View>
          </View>
        ) : undefined
      }
    >
      {planning ? monthTitle : <TitleRow>{monthTitle}</TitleRow>}
      {planning && (target || exam) ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <T tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {targetCourse?.shortName} · {target?.title ?? 'Study'}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <IconButton label="Less time" size={36} onPress={() => setHours(Math.max(1, hours - 1))}>
              <T>−</T>
            </IconButton>
            <T v="small">{hours} h</T>
            <IconButton label="More time" size={36} onPress={() => setHours(Math.min(30, hours + 1))}>
              <T>+</T>
            </IconButton>
          </View>
        </View>
      ) : null}
      <Gap h={16} />
      <WeekStrip selected={selected} onSelect={setSelected} tz={tz} today={today} marks={marks} />
      <Gap h={20} />

      <View style={{ height: (lastHour - firstHour) * HOUR_PX + 8 }}>
        {Array.from({ length: lastHour - firstHour + 1 }, (_, i) => (
          <View key={i} style={{ position: 'absolute', top: i * HOUR_PX, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T v="small" tone="faint" style={{ width: 40 }}>
              {String(firstHour + i).padStart(2, '0')}:00
            </T>
            <View style={{ flex: 1, height: 0.5, backgroundColor: c.border }} />
          </View>
        ))}
        {selected === today ? <View style={{ position: 'absolute', top: y(now), left: 44, right: 0, height: 1.5, backgroundColor: c.danger }} /> : null}
        {blocks.map((b) => {
          const top = Math.max(0, y(Math.max(b.start, selected)));
          const height = Math.max(28, y(Math.min(b.end, dayEnd)) - top - 2);
          const color = b.color ? courseColor(b.color) : c.muted;
          const base = { position: 'absolute' as const, top, height, left: 48, right: 0, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 };
          if (b.kind === 'suggestion') {
            return (
              <View key={b.key} style={[base, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.suggestion, backgroundColor: c.suggestionBg, flexDirection: 'row', alignItems: 'center' }]}>
                <View style={{ flex: 1 }}>
                  <T v="small" color={c.suggestion} numberOfLines={1}>
                    {formatHHMM(b.start, tz)}–{formatHHMM(b.end, tz)} · {b.title}
                  </T>
                </View>
                <IconButton label="Dismiss suggestion" size={32} filled={false} onPress={() => setDismissed(new Set([...dismissed, b.key]))}>
                  <X size={16} color={c.suggestion} />
                </IconButton>
                <IconButton label="Accept suggestion" size={32} onPress={() => accept(b.suggestion!)} style={{ backgroundColor: c.suggestion }}>
                  <Check size={16} color="#FFFFFF" strokeWidth={3} />
                </IconButton>
              </View>
            );
          }
          const bg = b.kind === 'busy' ? c.surface : b.kind === 'class' ? tint(color, c.bg, scheme === 'dark' ? 0.25 : 0.14) : b.kind === 'meeting' ? c.surface : tint(color, c.bg, 0.08);
          return (
            <Pressable key={b.key} disabled={!b.onPress} onPress={b.onPress} style={[base, { backgroundColor: bg, borderLeftWidth: b.kind === 'busy' ? 0 : 3, borderLeftColor: color }]}>
              <T v="small" tone={b.kind === 'busy' ? 'muted' : undefined} numberOfLines={1}>
                {b.title}
                {b.sub ? ` · ${b.sub}` : ''}
              </T>
              {height > 44 ? (
                <T v="small" tone="muted">
                  {formatHHMM(b.start, tz)}–{formatHHMM(b.end, tz)}
                </T>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <MonthSheet visible={monthOpen} onClose={() => setMonthOpen(false)} selected={selected} onSelect={setSelected} tz={tz} today={today} marks={marks} />
      {planning && plan.error ? (
        <T tone="danger" style={{ marginTop: 16 }}>
          {(plan.error as Error).message}
        </T>
      ) : null}
    </Screen>
  );
}
