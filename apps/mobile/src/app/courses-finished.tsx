import React from 'react';
import { View } from 'react-native';
import { Dot, Empty, Gap, Screen, SmallButton, T } from '@/components/ui';
import { useCourses } from '@/lib/db/queries';
import { reopenCourse } from '@/features/actions';

/** Finished courses archive — out of filters, alarms, prompts and Tasks sync. */
export default function FinishedCourses() {
  const { finished } = useCourses();
  return (
    <Screen back>
      <T v="display">Finished</T>
      <Gap h={28} />
      {finished.length === 0 ? <Empty title="No finished courses" /> : null}
      {finished.map((c) => (
        <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64 }}>
          <Dot color={c.color} size={10} />
          <View style={{ flex: 1 }}>
            <T v="item" tone="muted">
              {c.shortName}
            </T>
            <T v="meta" tone="faint">
              {c.code}
            </T>
          </View>
          <SmallButton title="Reopen" onPress={() => reopenCourse(c.id)} />
        </View>
      ))}
    </Screen>
  );
}
