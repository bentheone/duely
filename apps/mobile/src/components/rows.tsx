import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { HOUR, formatDue, isAssignmentOpen, type Assignment, type Course } from '@duely/shared';
import { CourseLabel, T } from './ui';

export function AssignmentRow({ a, course, now, tz }: { a: Assignment; course?: Course; now: number; tz: string }) {
  const open = isAssignmentOpen(a);
  const urgent = open && a.dueAt != null && a.dueAt - now <= 24 * HOUR;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${a.title}, ${course?.shortName ?? ''}${a.dueAt ? `, due ${formatDue(a.dueAt, now, tz)}` : ''}`}
      onPress={() => router.push(`/assignment/${a.id}`)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: 10, gap: 12, opacity: pressed ? 0.6 : 1 })}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <T v="item" tone={open ? undefined : 'faint'} numberOfLines={2} style={!open ? { textDecorationLine: 'line-through' } : undefined}>
          {a.title}
        </T>
        {course ? <CourseLabel color={course.color} name={course.shortName} suffix={a.kind === 'group' ? 'Group' : undefined} faint={!open} /> : null}
      </View>
      {a.dueAt ? (
        <T v="meta" tone={urgent ? 'danger' : open ? 'muted' : 'faint'}>
          {formatDue(a.dueAt, now, tz)}
        </T>
      ) : null}
    </Pressable>
  );
}
