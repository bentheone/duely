import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { DAY, EXAM_TYPE_LABELS, formatHHMM, formatShortDate, startOfZonedDay } from '@duely/shared';
import { CourseLabel, Empty, Gap, PillButton, Screen, T } from '@/components/ui';
import { useCourses, useExams } from '@/lib/db/queries';
import { useApp, useTz } from '@/lib/store';
import { syncNow } from '@/lib/sync/engine';
import { FONTS } from '@/lib/theme';

export default function Exams() {
  const tz = useTz();
  const exams = useExams();
  const { active, byId } = useCourses();
  const syncing = useApp((s) => s.syncing);
  const now = Date.now();
  const activeIds = useMemo(() => new Set(active.map((c) => c.id)), [active]);
  const upcoming = exams.filter((e) => activeIds.has(e.courseId) && e.startsAt > now - 3 * 3600_000);
  const past = exams.filter((e) => activeIds.has(e.courseId) && e.startsAt <= now - 3 * 3600_000).reverse();

  const row = (e: (typeof exams)[number], faint?: boolean) => {
    const c = byId.get(e.courseId);
    const days = Math.round((startOfZonedDay(e.startsAt, tz) - startOfZonedDay(now, tz)) / DAY);
    return (
      <Pressable key={e.id} accessibilityRole="button" onPress={() => router.push(`/exam/${e.id}`)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 68, gap: 16 }}>
        <View style={{ width: 56 }}>
          <T style={{ fontFamily: FONTS.display, fontSize: 26 }} tone={faint ? 'faint' : days <= 2 ? 'danger' : undefined}>
            {faint ? '—' : days <= 0 ? 'Today' : `${days}d`}
          </T>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <T v="item" tone={faint ? 'faint' : undefined}>
            {EXAM_TYPE_LABELS[e.type]}
          </T>
          {c ? <CourseLabel color={c.color} name={c.shortName} suffix={`${formatShortDate(e.startsAt, tz)} ${formatHHMM(e.startsAt, tz)}`} faint={faint} /> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <Screen onRefresh={() => void syncNow({ forceGoogle: true })} refreshing={syncing}>
      <T v="display">Exams</T>
      <Gap h={24} />
      {upcoming.length === 0 ? <Empty title="No exams coming up" action={<PillButton title="Add exam" onPress={() => router.push('/quick-add')} />} /> : null}
      {upcoming.map((e) => row(e))}
      {past.length ? (
        <>
          <Gap h={28} />
          {past.map((e) => row(e, true))}
        </>
      ) : null}
    </Screen>
  );
}
