import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { EXAM_TYPE_LABELS, formatDue, formatHHMM, formatShortDate, type SharedItem } from '@duely/shared';
import { Chip, CourseLabel, Gap, PillButton, Screen, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useCourses } from '@/lib/db/queries';
import { matchCourse, saveShared, savedShare } from '@/lib/share';
import { useApp, useTz } from '@/lib/store';

const NEW = '__new__';

/** Opened from a share link (duely://share/<token>): preview, pick a course, save a copy. */
export default function SharedScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const signedIn = useApp((s) => s.signedIn);
  const onboarded = useApp((s) => s.onboarded);
  const tz = useTz();
  const { active } = useCourses();
  const [saved, setSaved] = useState(() => (token ? savedShare(token) : null));
  const [choice, setChoice] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['share', token],
    queryFn: () => api<SharedItem>(`/shares/${token}`),
    enabled: !!token && signedIn,
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  const item = q.data;
  const matched = useMemo(() => (item ? matchCourse(item, active) : null), [item, active]);
  const courseId = choice ?? matched?.id ?? NEW;

  const open = (s: { kind: string; id: string }) => router.replace(s.kind === 'exam' ? `/exam/${s.id}` : s.kind === 'lecture' ? `/lecture/${s.id}` : `/assignment/${s.id}`);

  if (!signedIn || !onboarded) {
    return (
      <Screen back footer={<PillButton title="Sign in" onPress={() => router.replace('/')} />}>
        <T v="display">Shared with you</T>
        <Gap h={12} />
        <T tone="muted">Sign in to Duely first, then open the link again.</T>
      </Screen>
    );
  }

  if (q.isLoading) {
    return (
      <Screen back>
        <T tone="muted">Opening…</T>
      </Screen>
    );
  }

  if (!item) {
    const gone = q.error instanceof ApiError && q.error.status === 404;
    return (
      <Screen back footer={gone ? undefined : <PillButton title="Try again" onPress={() => void q.refetch()} />}>
        <T v="display">Can’t open</T>
        <Gap h={12} />
        <T tone="muted">{gone ? 'This link expired or was removed. Ask for a new one.' : 'Check your connection.'}</T>
      </Screen>
    );
  }

  const a = item.assignment;
  const e = item.exam;
  const lec = item.lecture;
  const meta = lec
    ? [formatShortDate(lec.at, tz), lec.topics.length ? `${lec.topics.length} topics` : null, lec.blocks.length ? `${lec.blocks.length} notes` : null]
    : a
    ? [
        a.dueAt != null ? `Due ${formatDue(a.dueAt, Date.now(), tz)}` : 'No due date',
        a.kind === 'group' ? `Group · ${a.group?.members.length ?? 0}` : null,
        a.subtasks.length ? `${a.subtasks.length} steps` : null,
      ]
    : e
      ? [`${formatShortDate(e.startsAt, tz)} ${formatHHMM(e.startsAt, tz)}`, e.room, e.topics.length ? `${e.topics.length} topics` : null]
      : [];
  if (item.files.length) meta.push(`${item.files.length} ${item.files.length === 1 ? 'file' : 'files'}`);

  return (
    <Screen
      back
      footer={
        saved ? (
          <PillButton title="Open" onPress={() => open(saved)} />
        ) : (
          <PillButton
            title="Save to my Duely"
            onPress={() => {
              const s = saveShared(item, courseId === NEW ? null : courseId);
              setSaved(s);
              open(s);
            }}
          />
        )
      }
    >
      <T v="small" tone="muted">
        From {item.from.name}
      </T>
      <Gap h={12} />
      <CourseLabel color={item.course.color} name={item.course.shortName} suffix={e ? EXAM_TYPE_LABELS[e.type] : lec ? 'Lecture' : a?.kind === 'group' ? 'Group' : undefined} />
      <Gap h={10} />
      <T v="title">{a?.title ?? (e ? EXAM_TYPE_LABELS[e.type] : (lec?.title || lec?.topics[0] || 'Lecture notes'))}</T>
      {lec?.topics.length ? (
        <>
          <Gap h={8} />
          <T tone="muted">{lec.topics.join(' · ')}</T>
        </>
      ) : null}
      <Gap h={8} />
      <T tone="muted">{meta.filter(Boolean).join(' · ')}</T>
      {a?.notes || e?.notes ? (
        <>
          <Gap h={16} />
          <T numberOfLines={6}>{a?.notes || e?.notes}</T>
        </>
      ) : null}

      {saved ? (
        <>
          <Gap h={28} />
          <T tone="muted">Saved. Changes you make are yours only.</T>
        </>
      ) : (
        <>
          <Gap h={28} />
          <T v="small" tone="muted">
            Save to
          </T>
          <Gap h={10} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -28 }}>
            <View style={{ width: 20 }} />
            {active.map((c) => (
              <Chip key={c.id} label={c.shortName} color={c.color} selected={courseId === c.id} onPress={() => setChoice(c.id)} />
            ))}
            {!matched ? <Chip label={`+ ${item.course.shortName}`} color={item.course.color} selected={courseId === NEW} onPress={() => setChoice(NEW)} /> : null}
            <View style={{ width: 20 }} />
          </ScrollView>
        </>
      )}
    </Screen>
  );
}
