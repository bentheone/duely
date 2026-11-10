import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { CalendarListItem } from '@duely/shared';
import { Checkbox, Gap, PillButton, Screen, SmallButton, T } from '@/components/ui';
import { api } from '@/lib/api';
import { syncNow } from '@/lib/sync/engine';
import { useTheme } from '@/lib/theme';

/** Two questions, one per screen: timetable calendar(s), then busy calendar(s) (§7.2). */
export function CalendarPicker({ onDone, back }: { onDone: () => void; back?: boolean }) {
  const { c } = useTheme();
  const q = useQuery({ queryKey: ['calendars'], queryFn: () => api<CalendarListItem[]>('/integrations/google/calendars') });
  const [step, setStep] = useState<'timetable' | 'busy'>('timetable');
  const [timetable, setTimetable] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setTimetable(new Set(q.data.filter((x) => x.timetable).map((x) => x.id)));
    setBusy(new Set(q.data.filter((x) => x.busy).map((x) => x.id)));
  }, [q.data]);

  const sel = step === 'timetable' ? timetable : busy;
  const setSel = step === 'timetable' ? setTimetable : setBusy;
  const toggle = (id: string) => {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSel(n);
  };

  async function next() {
    if (step === 'timetable') {
      setStep('busy');
      return;
    }
    setSaving(true);
    try {
      await api('/integrations/google/calendars', {
        method: 'PUT',
        body: { timetableCalendarIds: [...timetable], busyCalendarIds: [...busy].filter((id) => !timetable.has(id)) },
      });
      await syncNow({ forceGoogle: true });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      back={back}
      footer={
        <PillButton
          title={step === 'timetable' ? 'Next' : 'Save'}
          onPress={next}
          loading={saving}
          disabled={step === 'timetable' && timetable.size === 0}
        />
      }
    >
      <T v="display">{step === 'timetable' ? 'Your timetable' : 'Busy times'}</T>
      <Gap h={8} />
      <T tone="muted">{step === 'timetable' ? 'Which calendar holds your classes?' : 'Which calendars should block study time?'}</T>
      <Gap h={28} />
      {q.isLoading ? <ActivityIndicator color={c.muted} /> : null}
      {q.error ? (
        <View style={{ gap: 12 }}>
          <T tone="danger">Couldn’t load your calendars.</T>
          <SmallButton title="Try again" onPress={() => void q.refetch()} />
        </View>
      ) : null}
      {(q.data ?? [])
        .filter((cal) => step === 'timetable' || !timetable.has(cal.id))
        .map((cal) => (
          <Pressable
            key={cal.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: sel.has(cal.id) }}
            onPress={() => toggle(cal.id)}
            style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14 }}
          >
            <Checkbox checked={sel.has(cal.id)} onToggle={() => toggle(cal.id)} label={cal.summary} />
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cal.backgroundColor ?? c.faint }} />
            <T v="item" style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>
              {cal.summary}
            </T>
            {cal.primary ? <T v="small" tone="muted">Primary</T> : null}
          </Pressable>
        ))}
    </Screen>
  );
}
