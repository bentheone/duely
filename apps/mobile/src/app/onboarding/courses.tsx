import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { COURSE_PALETTE, type GoogleSyncSummary } from '@duely/shared';
import { Checkbox, Gap, Input, PillButton, Screen, SmallButton, T } from '@/components/ui';
import { courseFromEventTitle, ensureSemester, seedOwnerCourses, upsertCourse, addMatchRule } from '@/features/actions';
import { getMetaJson } from '@/lib/db/repo';
import { useCourses } from '@/lib/db/queries';
import { syncNow } from '@/lib/sync/engine';
import { useTheme } from '@/lib/theme';

interface Candidate {
  key: string;
  eventTitle?: string;
  courseId?: string;
  shortName: string;
  code: string;
  title: string;
  color: string;
  include: boolean;
}

/** Confirm detected courses — short name + colour per course, prefilled (§11.3 onboarding). */
export default function OnboardingCourses() {
  const { course: courseColor } = useTheme();
  const { active } = useCourses();
  const unmatched = getMetaJson<GoogleSyncSummary['unmatchedEvents']>('unmatchedEvents', []);

  const initial = useMemo<Candidate[]>(() => {
    if (active.length) {
      return active.map((c) => ({ key: c.id, courseId: c.id, shortName: c.shortName, code: c.code, title: c.title, color: c.color, include: true }));
    }
    return unmatched
      .filter((e) => e.recurring)
      .map((e, i) => {
        const g = courseFromEventTitle(e.title);
        return { key: e.eventId, eventTitle: e.title, ...g, color: COURSE_PALETTE[i % COURSE_PALETTE.length]!.light, include: true };
      });
  }, [active.length]);
  const [items, setItems] = useState<Candidate[]>(initial);
  const [saving, setSaving] = useState(false);
  if (items.length === 0 && initial.length > 0) setItems(initial);

  const update = (key: string, p: Partial<Candidate>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const cycleColor = (c: Candidate) => {
    const i = COURSE_PALETTE.findIndex((p) => p.light === c.color);
    update(c.key, { color: COURSE_PALETTE[(i + 1) % COURSE_PALETTE.length]!.light });
  };

  async function next() {
    setSaving(true);
    try {
      const sem = ensureSemester();
      for (const it of items.filter((x) => x.include && x.shortName.trim())) {
        const c = upsertCourse({ id: it.courseId, semesterId: sem.id, shortName: it.shortName.trim(), code: it.code, title: it.title, color: it.color });
        if (it.eventTitle) addMatchRule(c.id, it.eventTitle);
      }
      await syncNow({ forceGoogle: true });
      const left = getMetaJson<GoogleSyncSummary['unmatchedEvents']>('unmatchedEvents', []).filter((e) => e.recurring);
      router.replace(left.length ? '/which-course?onboarding=1' : '/onboarding/storage');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen footer={<PillButton title="Continue" onPress={next} loading={saving} disabled={!items.some((x) => x.include)} />}>
      <T v="display">Your courses</T>
      <Gap h={8} />
      <T tone="muted">Short names show everywhere. Tap a dot to change its colour.</T>
      <Gap h={28} />
      {items.length === 0 ? (
        <View style={{ gap: 16 }}>
          <T tone="muted">No classes found in your timetable yet.</T>
          <SmallButton
            title="Use Fall 2026 courses"
            onPress={() => {
              const seeded = seedOwnerCourses();
              setItems(seeded.map((c) => ({ key: c.id, courseId: c.id, shortName: c.shortName, code: c.code, title: c.title, color: c.color, include: true })));
            }}
          />
          <SmallButton title="Add courses later" onPress={() => router.replace('/onboarding/storage')} />
        </View>
      ) : null}
      {items.map((c) => (
        <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Checkbox checked={c.include} onToggle={() => update(c.key, { include: !c.include })} label={`Include ${c.shortName}`} />
          <Pressable accessibilityLabel={`Colour for ${c.shortName}`} onPress={() => cycleColor(c)} hitSlop={12} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: courseColor(c.color) }} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Input value={c.shortName} onChangeText={(t) => update(c.key, { shortName: t })} maxLength={24} accessibilityLabel="Short name" />
            {c.code || c.eventTitle ? (
              <T v="small" tone="faint" style={{ marginTop: 4 }} numberOfLines={1}>
                {c.code || c.eventTitle}
              </T>
            ) : null}
          </View>
        </View>
      ))}
    </Screen>
  );
}
