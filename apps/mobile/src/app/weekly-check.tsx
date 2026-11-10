import React, { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Check, Plus } from 'lucide-react-native';
import { coursesNeedingReview } from '@duely/shared';
import { Dot, Gap, IconButton, Screen, T } from '@/components/ui';
import { logMissed } from '@/features/actions';
import { useActiveSemester, useAssignments, useCourses, useMissedChecks } from '@/lib/db/queries';
import { useSettings } from '@/lib/store';
import { useTheme } from '@/lib/theme';

/** §11.3 #10 Weekly check: active courses with nothing logged lately. */
export default function WeeklyCheck() {
  const { c } = useTheme();
  const settings = useSettings();
  const { active, byId } = useCourses();
  const assignments = useAssignments();
  const logs = useMissedChecks();
  const sem = useActiveSemester();
  const rows = useMemo(
    () => coursesNeedingReview(active, assignments, logs, settings.missedCheck.quietDays, Date.now(), sem ? Date.parse(sem.startsOn) : undefined),
    [active, assignments, logs, settings.missedCheck.quietDays, sem],
  );

  return (
    <Screen back>
      <T v="display">Anything missed?</T>
      <Gap h={8} />
      {rows.length ? <T tone="muted">Nothing logged lately for:</T> : null}
      <Gap h={24} />
      {rows.length === 0 ? <T style={{ fontSize: 17 }}>All caught up</T> : null}
      {rows.map((r) => {
        const course = byId.get(r.courseId)!;
        return (
          <View key={r.courseId} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64 }}>
            <Dot color={course.color} size={10} />
            <View style={{ flex: 1 }}>
              <T v="item">{course.shortName}</T>
              <T v="meta" tone="muted">
                {r.daysQuiet} days
              </T>
            </View>
            <IconButton label={`Nothing new for ${course.shortName}`} onPress={() => logMissed(course.id, 'none')}>
              <Check size={20} color={c.text} />
            </IconButton>
            <IconButton label={`Add assignment for ${course.shortName}`} onPress={() => router.push({ pathname: '/quick-add', params: { courseId: course.id } })}>
              <Plus size={20} color={c.text} />
            </IconButton>
          </View>
        );
      })}
    </Screen>
  );
}
