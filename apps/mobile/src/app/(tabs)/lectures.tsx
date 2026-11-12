import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Flag } from 'lucide-react-native';
import { DAY, MONTH_SHORT, WEEKDAY_SHORT, formatHHMM, zonedParts } from '@duely/shared';
import { Chip, CourseLabel, Empty, Gap, PillButton, Screen, SmallButton, T } from '@/components/ui';
import { TitleRow } from '@/components/ProfileButton';
import { openResearch } from '@/features/lecture/blocks';
import { useClassSessions, useCourses, useLectures } from '@/lib/db/queries';
import { syncNow } from '@/lib/sync/engine';
import { useTz } from '@/lib/store';
import { FONTS, useTheme } from '@/lib/theme';

const LOG_WINDOW = 14 * DAY;

/** Lectures: classes still to log, "relook later" points, then logged lectures (newest first). */
export default function Lectures() {
  const { c } = useTheme();
  const tz = useTz();
  const lectures = useLectures();
  const classes = useClassSessions();
  const { active, byId } = useCourses();
  const [filter, setFilter] = useState<string | null>(null);
  const [showRelook, setShowRelook] = useState(false);
  const now = Date.now();

  const activeIds = useMemo(() => new Set(active.map((x) => x.id)), [active]);
  const mine = useMemo(() => lectures.filter((l) => activeIds.has(l.courseId) && (!filter || l.courseId === filter)), [lectures, activeIds, filter]);
  const toLog = useMemo(() => {
    const logged = new Set(lectures.map((l) => l.classSessionId).filter(Boolean));
    return classes
      .filter((cs) => cs.end <= now && cs.end > now - LOG_WINDOW && activeIds.has(cs.courseId) && !logged.has(cs.id) && (!filter || cs.courseId === filter))
      .sort((a, b) => b.start - a.start)
      .slice(0, 5);
  }, [classes, lectures, activeIds, filter, now]);
  const relook = useMemo(() => openResearch(mine), [mine]);

  const newLecture = (courseId?: string, classSessionId?: string) =>
    router.push({ pathname: '/lecture/[id]', params: { id: 'new', ...(courseId ? { courseId } : {}), ...(classSessionId ? { classSessionId } : {}) } });

  return (
    <Screen onRefresh={() => syncNow()}>
      <TitleRow>
        <T v="display">Lectures</T>
      </TitleRow>
      <Gap h={20} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -28 }}>
        <View style={{ width: 20 }} />
        <Chip label="All" selected={!filter} onPress={() => setFilter(null)} />
        {active.map((co) => (
          <Chip key={co.id} label={co.shortName} color={co.color} selected={filter === co.id} onPress={() => setFilter(filter === co.id ? null : co.id)} />
        ))}
        <View style={{ width: 20 }} />
      </ScrollView>
      <Gap h={24} />

      {toLog.length ? (
        <View style={{ marginBottom: 24 }}>
          <T v="small" tone="danger" style={{ marginBottom: 4 }}>
            To log
          </T>
          {toLog.map((cs) => {
            const co = byId.get(cs.courseId);
            const p = zonedParts(cs.start, tz);
            return (
              <View key={cs.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 12 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  {co ? <CourseLabel color={co.color} name={co.shortName} suffix={`${WEEKDAY_SHORT[p.weekday]} ${p.day} ${MONTH_SHORT[p.month - 1]} · ${formatHHMM(cs.start, tz)}`} /> : null}
                </View>
                <SmallButton title="Log" tone="primary" onPress={() => newLecture(cs.courseId, cs.id)} />
              </View>
            );
          })}
        </View>
      ) : null}

      {relook.length ? (
        <View style={{ marginBottom: 24 }}>
          <Pressable accessibilityRole="button" onPress={() => setShowRelook(!showRelook)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
            <Flag size={16} color={c.suggestion} />
            <T v="item" style={{ flex: 1 }}>
              Relook later · {relook.length}
            </T>
            <T tone="faint">{showRelook ? '▾' : '›'}</T>
          </Pressable>
          {showRelook
            ? relook.slice(0, 30).map(({ lecture, block }) => (
                <Pressable
                  key={block.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/lecture/${lecture.id}`)}
                  style={{ paddingVertical: 10, paddingLeft: 24, gap: 2 }}
                >
                  <T v="body">{block.text}</T>
                  <T v="meta" tone="muted">
                    {byId.get(lecture.courseId)?.shortName} · {lecture.title || lecture.topics[0] || 'Lecture'}
                  </T>
                </Pressable>
              ))
            : null}
        </View>
      ) : null}

      {!mine.length && !toLog.length ? (
        <Empty title="No lectures yet" hint="After each class, jot the main topics. Duely reminds you." action={<PillButton title="Log a lecture" onPress={() => newLecture(filter ?? undefined)} />} />
      ) : (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 }}>
          <SmallButton title="+ Lecture" onPress={() => newLecture(filter ?? undefined)} />
        </View>
      )}

      {mine.map((l) => {
        const co = byId.get(l.courseId);
        const p = zonedParts(l.at, tz);
        const research = l.blocks.filter((b) => b.type === 'research' && !b.done).length;
        return (
          <Pressable key={l.id} accessibilityRole="button" onPress={() => router.push(`/lecture/${l.id}`)} style={{ flexDirection: 'row', gap: 16, paddingVertical: 14 }}>
            <View style={{ width: 44, alignItems: 'flex-start' }}>
              <T style={{ fontFamily: FONTS.display, fontSize: 24, lineHeight: 28 }}>{p.day}</T>
              <T v="small" tone="muted">
                {MONTH_SHORT[p.month - 1]}
              </T>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <T v="item" numberOfLines={1}>
                {l.title || l.topics[0] || 'Untitled lecture'}
              </T>
              {l.topics.length ? (
                <T v="meta" tone="muted" numberOfLines={2}>
                  {l.topics.join(' · ')}
                </T>
              ) : null}
              {co ? <CourseLabel color={co.color} name={co.shortName} suffix={research ? `${research} to relook` : undefined} /> : null}
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}
