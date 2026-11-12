import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MoreHorizontal, Share2 } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import {
  DAY,
  EXAM_TYPE_LABELS,
  WEEKDAY_SHORT,
  formatHHMM,
  formatShortDate,
  startOfZonedDay,
  uuidv7,
  zonedParts,
  type Exam,
  type Session,
} from '@duely/shared';
import { Checkbox, CourseLabel, Empty, Gap, IconButton, Input, OptionList, PillButton, Screen, Sheet, SmallButton, T } from '@/components/ui';
import { FileTiles } from '@/components/FileTiles';
import { pickDateTime } from '@/components/pickers';
import { EXAM_TYPE_OPTIONS } from '@/features/fieldOptions';
import { addManualSession } from '@/features/actions';
import { useCourses, useExam, useSessions } from '@/lib/db/queries';
import { remove, save } from '@/lib/db/repo';
import { api } from '@/lib/api';
import { useApp, useSettings, useTz } from '@/lib/store';
import { ShareSheet } from '@/features/ShareSheet';
import { FONTS, useTheme } from '@/lib/theme';

/** §11.3 #8 Exam: huge countdown, topics checklist, study sessions, Add study time (manual + hints). */
export default function ExamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const tz = useTz();
  const settings = useSettings();
  const online = useApp((s) => s.online);
  const exam = useExam(id);
  const { byId } = useCourses();
  const sessions = useSessions();
  const [topic, setTopic] = useState('');
  const [sheet, setSheet] = useState<null | 'menu' | 'type' | 'study'>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const now = Date.now();
  const study = useMemo(() => sessions.filter((s) => s.examId === id && s.status !== 'skipped'), [sessions, id]);

  // Free-slot hints for the manual picker (online only).
  const hints = useQuery({
    queryKey: ['exam-hints', id],
    enabled: sheet === 'study' && online && !!exam,
    queryFn: () => api<{ suggestions: Session[] }>('/planner/suggest', { body: { examId: id, totalMinutes: settings.sessionDefaultMinutes * 3 } }),
  });

  if (!exam) {
    return (
      <Screen back>
        <Empty title="Exam not found" />
      </Screen>
    );
  }
  const course = byId.get(exam.courseId);
  const days = Math.round((startOfZonedDay(exam.startsAt, tz) - startOfZonedDay(now, tz)) / DAY);
  const update = (p: Partial<Exam>) => save('exams', { id: exam.id, ...p });
  const topicTitle = (s: Session) => s.title || 'Study';

  async function addStudy(start?: number, minutes?: number) {
    const t = start ?? (await pickDateTime(Math.min(exam!.startsAt - DAY, now + DAY), tz));
    if (!t) return;
    const open = exam!.topics.find((x) => !x.done);
    addManualSession({ examId: exam!.id, title: open?.title ?? 'Study', start: t, minutes: minutes ?? settings.sessionDefaultMinutes });
    setSheet(null);
  }

  return (
    <Screen
      back
      right={
        <>
          <IconButton
            label="Share with a friend"
            onPress={() => setShareOpen(true)}
          >
            <Share2 size={20} color={c.text} />
          </IconButton>
          <IconButton label="More" onPress={() => setSheet('menu')}>
            <MoreHorizontal size={20} color={c.text} />
          </IconButton>
        </>
      }
      footer={exam.startsAt > now ? <PillButton title="Add study time" onPress={() => setSheet('study')} /> : undefined}
    >
      {course ? <CourseLabel color={course.color} name={course.shortName} suffix={EXAM_TYPE_LABELS[exam.type]} /> : null}
      <Gap h={12} />
      <T style={{ fontFamily: FONTS.display, fontSize: 96, lineHeight: 100, letterSpacing: -3 }} accessibilityLabel={`${days} days`}>
        {days <= 0 ? (exam.startsAt > now ? 'Today' : 'Done') : days}
      </T>
      {days > 0 ? <T v="heading" tone="muted">{days === 1 ? 'day' : 'days'}</T> : null}
      <Gap h={12} />
      <Pressable
        accessibilityRole="button"
        onPress={async () => {
          const t = await pickDateTime(exam.startsAt, tz);
          if (t) update({ startsAt: t });
        }}
      >
        <T tone="muted">
          {formatShortDate(exam.startsAt, tz)} · {formatHHMM(exam.startsAt, tz)}
          {exam.durationMin ? ` · ${exam.durationMin} min` : ''}
          {exam.room ? ` · ${exam.room}` : ''}
        </T>
      </Pressable>

      <Gap h={32} />
      {exam.topics.map((t) => (
        <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 }}>
          <Checkbox checked={t.done} onToggle={() => update({ topics: exam.topics.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) })} label={t.title} />
          <Pressable
            style={{ flex: 1 }}
            onLongPress={() =>
              Alert.alert(t.title, undefined, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => update({ topics: exam.topics.filter((x) => x.id !== t.id) }) },
              ])
            }
          >
            <T tone={t.done ? 'faint' : undefined} style={t.done ? { textDecorationLine: 'line-through' } : undefined}>
              {t.title}
            </T>
          </Pressable>
        </View>
      ))}
      <Input
        placeholder="Add a topic"
        value={topic}
        onChangeText={setTopic}
        onSubmitEditing={() => {
          if (topic.trim()) update({ topics: [...exam.topics, { id: uuidv7(), title: topic.trim(), done: false }] });
          setTopic('');
        }}
        style={{ backgroundColor: 'transparent', paddingHorizontal: 0 }}
        accessibilityLabel="Add a topic"
      />

      {study.length ? (
        <>
          <Gap h={28} />
          {study.map((s) => {
            const p = zonedParts(s.start, tz);
            return (
              <Pressable
                key={s.id}
                onLongPress={() =>
                  Alert.alert('Remove study session?', undefined, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => remove('sessions', s.id) },
                  ])
                }
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, backgroundColor: c.suggestionBg, borderRadius: 14, paddingHorizontal: 16, marginBottom: 8, opacity: s.end < now ? 0.5 : 1 }}
              >
                <T v="small" style={{ width: 34 }}>
                  {WEEKDAY_SHORT[p.weekday]}
                </T>
                <T style={{ flex: 1 }} numberOfLines={1}>
                  {topicTitle(s)}
                </T>
                <T v="meta" tone="muted">
                  {formatHHMM(s.start, tz)}
                </T>
              </Pressable>
            );
          })}
        </>
      ) : null}

      <Gap h={28} />
      <FileTiles ownerType="exam" ownerId={exam.id} />

      <Sheet visible={sheet === 'study'} onClose={() => setSheet(null)} title="Add study time">
        {hints.data?.suggestions.length ? (
          <>
            <T v="small" tone="muted" style={{ marginBottom: 8 }}>
              Free slots
            </T>
            {hints.data.suggestions.map((s) => (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                onPress={() => void addStudy(s.start, Math.round((s.end - s.start) / 60_000))}
                style={{ minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.suggestion, paddingHorizontal: 16, justifyContent: 'center', marginBottom: 8 }}
              >
                <T color={c.suggestion}>
                  {formatShortDate(s.start, tz)} · {formatHHMM(s.start, tz)}–{formatHHMM(s.end, tz)}
                </T>
              </Pressable>
            ))}
            <Gap h={8} />
          </>
        ) : null}
        <SmallButton title="Pick a time" onPress={() => void addStudy()} />
      </Sheet>
      <Sheet visible={sheet === 'menu'} onClose={() => setSheet(null)}>
        <OptionList
          options={[
            { value: 'details', label: 'Details' },
            { value: 'delete', label: 'Delete' },
          ]}
          onSelect={(v) => {
            if (v === 'details') return setSheet('type');
            setSheet(null);
            Alert.alert('Delete exam?', undefined, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  remove('exams', exam.id);
                  router.back();
                },
              },
            ]);
          }}
        />
      </Sheet>
      <Sheet visible={sheet === 'type'} onClose={() => setSheet(null)} title="Details">
        <OptionList options={EXAM_TYPE_OPTIONS} value={exam.type} onSelect={(t) => update({ type: t })} />
        <Gap h={12} />
        <View style={{ gap: 10 }}>
          <Input
            placeholder="Room"
            defaultValue={exam.room ?? ''}
            onEndEditing={(e) => update({ room: e.nativeEvent.text.trim() || null })}
            accessibilityLabel="Room"
          />
          <Input
            placeholder="Duration (minutes)"
            keyboardType="number-pad"
            defaultValue={exam.durationMin ? String(exam.durationMin) : ''}
            onEndEditing={(e) => update({ durationMin: Number(e.nativeEvent.text) || null })}
            accessibilityLabel="Duration in minutes"
          />
        </View>
        <Gap h={16} />
        <SmallButton title="Done" tone="primary" onPress={() => setSheet(null)} />
      </Sheet>
      <ShareSheet visible={shareOpen} onClose={() => setShareOpen(false)} kind="exam" id={exam.id} title={`${EXAM_TYPE_LABELS[exam.type]}${course ? ` · ${course.shortName}` : ''}`} courseCode={course?.code} />
    </Screen>
  );
}
