import React from 'react';
import { Pressable, View } from 'react-native';
import { Checkbox, Gap, Sheet, SmallButton, T } from '@/components/ui';
import { REMINDER_CHOICES } from './fieldOptions';

/** Per-assignment reminder offsets (null = user default). */
export function RemindersSheet({
  visible,
  onClose,
  value,
  onChange,
  defaults,
}: {
  visible: boolean;
  onClose: () => void;
  value: string[] | null | undefined;
  onChange: (v: string[] | null) => void;
  defaults: string[];
}) {
  const current = value ?? defaults;
  const toggle = (v: string) => onChange(current.includes(v) ? current.filter((x) => x !== v) : [...current, v]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Reminders">
      {REMINDER_CHOICES.map((r) => (
        <Pressable key={r.value} onPress={() => toggle(r.value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52 }}>
          <Checkbox checked={current.includes(r.value)} onToggle={() => toggle(r.value)} label={r.label} />
          <T>{r.label}</T>
        </Pressable>
      ))}
      <Gap h={12} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SmallButton title="Use default" onPress={() => onChange(null)} />
        <SmallButton title="Done" tone="primary" onPress={onClose} />
      </View>
    </Sheet>
  );
}
