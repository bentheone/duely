import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { GoogleSyncSummary } from '@duely/shared';
import { Chip, Empty, Gap, PillButton, Screen, T } from '@/components/ui';
import { addMatchRule } from '@/features/actions';
import { getMetaJson, setMetaJson } from '@/lib/db/repo';
import { useCourses } from '@/lib/db/queries';
import { syncNow } from '@/lib/sync/engine';

/** "Which course is this?" for unmatched recurring timetable events (§7.2). Appends a match rule. */
export default function WhichCourse() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const { active } = useCourses();
  const ignored = getMetaJson<string[]>('ignoredEvents', []);
  const [events] = useState(() =>
    getMetaJson<GoogleSyncSummary['unmatchedEvents']>('unmatchedEvents', []).filter((e) => e.recurring && !ignored.includes(e.eventId)),
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function done() {
    setSaving(true);
    try {
      const skip = [...ignored];
      for (const e of events) {
        const a = answers[e.eventId];
        if (a === 'none') skip.push(e.eventId);
        else if (a) addMatchRule(a, e.title);
      }
      setMetaJson('ignoredEvents', skip);
      await syncNow({ forceGoogle: true });
    } finally {
      setSaving(false);
    }
    if (onboarding) router.replace('/onboarding/storage');
    else router.back();
  }

  return (
    <Screen back={!onboarding} footer={<PillButton title="Done" onPress={done} loading={saving} />}>
      <T v="display">Which course is this?</T>
      <Gap h={28} />
      {events.length === 0 ? <Empty title="All classes matched" /> : null}
      {events.map((e) => (
        <View key={e.eventId} style={{ marginBottom: 28 }}>
          <T v="item">{e.title}</T>
          <Gap h={10} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {active.map((c) => (
              <Chip key={c.id} label={c.shortName} color={c.color} selected={answers[e.eventId] === c.id} onPress={() => setAnswers({ ...answers, [e.eventId]: c.id })} />
            ))}
            <Chip label="Not a class" selected={answers[e.eventId] === 'none'} onPress={() => setAnswers({ ...answers, [e.eventId]: 'none' })} />
          </ScrollView>
        </View>
      ))}
    </Screen>
  );
}
