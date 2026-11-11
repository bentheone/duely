import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { DAY, isAssignmentOpen, startOfZonedDay } from '@duely/shared';
import { Chip, Empty, Gap, PillButton, Screen, T } from '@/components/ui';
import { AssignmentRow } from '@/components/rows';
import { TitleRow } from '@/components/ProfileButton';
import { useAssignments, useCourses } from '@/lib/db/queries';
import { useTz } from '@/lib/store';
import { syncNow } from '@/lib/sync/engine';

/** §11.3 #5: course chips by short name; Overdue / This week / Later. */
export default function Assignments() {
  const tz = useTz();
  const all = useAssignments();
  const { active, byId } = useCourses();
  const [filter, setFilter] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const now = Date.now();

  const groups = useMemo(() => {
    const activeIds = new Set(active.map((c) => c.id));
    const list = all.filter((a) => activeIds.has(a.courseId) && (!filter || a.courseId === filter));
    const weekEnd = startOfZonedDay(now, tz) + 7 * DAY;
    const open = list.filter(isAssignmentOpen);
    return {
      overdue: open.filter((a) => a.dueAt != null && a.dueAt < now),
      week: open.filter((a) => a.dueAt != null && a.dueAt >= now && a.dueAt < weekEnd),
      later: open.filter((a) => a.dueAt == null || a.dueAt >= weekEnd),
      done: list.filter((a) => !isAssignmentOpen(a)).sort((a, b) => b.updatedAt - a.updatedAt),
    };
  }, [all, active, filter, now, tz]);

  const section = (title: string, items: typeof all, danger?: boolean) =>
    items.length ? (
      <View style={{ marginBottom: 20 }}>
        <T v="small" tone={danger ? 'danger' : 'muted'} style={{ marginBottom: 2 }}>
          {title}
        </T>
        {items.map((a) => (
          <AssignmentRow key={a.id} a={a} course={byId.get(a.courseId)} now={now} tz={tz} />
        ))}
      </View>
    ) : null;

  const empty = !groups.overdue.length && !groups.week.length && !groups.later.length;

  return (
    <Screen onRefresh={() => syncNow({ forceGoogle: true })}>
      <TitleRow>
        <T v="display">Assignments</T>
      </TitleRow>
      <Gap h={20} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -28 }} contentInset={{ left: 28 }}>
        <View style={{ width: 20 }} />
        <Chip label="All" selected={!filter} onPress={() => setFilter(null)} />
        {active.map((c) => (
          <Chip key={c.id} label={c.shortName} color={c.color} selected={filter === c.id} onPress={() => setFilter(filter === c.id ? null : c.id)} />
        ))}
        <View style={{ width: 20 }} />
      </ScrollView>
      <Gap h={24} />
      {empty ? (
        <Empty title="Nothing due" hint="Add one with +" action={<PillButton title="Add assignment" onPress={() => router.push('/quick-add')} />} />
      ) : null}
      {section('Overdue', groups.overdue, true)}
      {section('This week', groups.week)}
      {section('Later', groups.later)}
      {groups.done.length ? (
        <Pressable accessibilityRole="button" onPress={() => setShowDone(!showDone)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <T v="small" tone="faint">
            Done · {groups.done.length} {showDone ? '▾' : '›'}
          </T>
        </Pressable>
      ) : null}
      {showDone ? groups.done.map((a) => <AssignmentRow key={a.id} a={a} course={byId.get(a.courseId)} now={now} tz={tz} />) : null}
    </Screen>
  );
}
