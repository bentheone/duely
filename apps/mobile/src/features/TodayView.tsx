import React from 'react';
import { Image, Pressable, View } from 'react-native';
import { MONTH_SHORT, WEEKDAY_LONG, formatHHMM, zonedParts, type Course } from '@duely/shared';
import { Card, CourseLabel, Gap, IconButton, Screen, SmallButton, T } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import type { TodayItem } from './today';

export interface TodayViewProps {
  now: number;
  tz: string;
  items: TodayItem[];
  classEnded: { course: Course; classSessionId: string } | null;
  avatarUrl?: string | null;
  initial?: string;
  status?: string | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  onOpen: (href: string) => void;
  onAvatar: () => void;
  onAdd: (courseId: string, classSessionId: string) => void;
  onNo: (courseId: string, classSessionId: string) => void;
}

/** Presentational Today (§11.3 #1/#2) — tokens make the dark variant. */
export function TodayView(p: TodayViewProps) {
  const { c } = useTheme();
  const d = zonedParts(p.now, p.tz);
  return (
    <Screen onRefresh={p.onRefresh} refreshing={p.refreshing}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <T v="display" tone="muted" style={{ color: c.muted }}>
            {WEEKDAY_LONG[d.weekday]}
          </T>
          <T v="display">
            {d.day} {MONTH_SHORT[d.month - 1]}
          </T>
        </View>
        <IconButton label="Courses and settings" onPress={p.onAvatar}>
          {p.avatarUrl ? (
            <Image source={{ uri: p.avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} />
          ) : (
            <T v="item">{p.initial ?? '·'}</T>
          )}
        </IconButton>
      </View>
      {p.status ? (
        <T v="small" tone="faint" style={{ marginTop: 8 }}>
          {p.status}
        </T>
      ) : null}
      <Gap h={32} />

      {p.classEnded ? (
        <>
          <Card>
            <T v="body" style={{ fontSize: 16 }}>
              New assignment from <T v="item" style={{ fontSize: 16 }}>{p.classEnded.course.shortName}</T>?
            </T>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <SmallButton title="Add" tone="primary" onPress={() => p.onAdd(p.classEnded!.course.id, p.classEnded!.classSessionId)} />
              <SmallButton title="No" onPress={() => p.onNo(p.classEnded!.course.id, p.classEnded!.classSessionId)} />
            </View>
          </Card>
          <Gap h={24} />
        </>
      ) : null}

      {p.items.length === 0 ? (
        <T tone="muted" style={{ fontSize: 17 }}>
          Nothing today.
        </T>
      ) : null}
      {p.items.map((it) => (
        <Pressable
          key={it.key}
          testID={`today-${it.kind}`}
          disabled={!it.href}
          onPress={() => it.href && p.onOpen(it.href)}
          accessibilityRole={it.href ? 'button' : undefined}
          style={({ pressed }) => ({ flexDirection: 'row', gap: 14, minHeight: 56, marginBottom: 14, opacity: pressed ? 0.6 : 1 })}
        >
          <T v="meta" tone={it.danger && !it.faint ? 'danger' : it.faint ? 'faint' : 'muted'} style={{ width: 44, paddingTop: 2 }}>
            {it.at != null ? formatHHMM(it.at, p.tz) : '!'}
          </T>
          <View style={{ flex: 1, gap: 4 }}>
            <T v="item" tone={it.faint ? 'faint' : it.danger ? 'danger' : undefined} numberOfLines={2}>
              {it.title}
            </T>
            {it.course ? <CourseLabel color={it.course.color} name={it.course.shortName} suffix={it.suffix} faint={it.faint} /> : it.suffix ? <T v="meta" tone="muted">{it.suffix}</T> : null}
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}
