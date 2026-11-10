import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { SUBMISSION_LABELS, formatDue, formatHHMM, type Assignment } from '@duely/shared';
import { FieldRow, Gap, Input, OptionList, PillButton, Screen, Segmented, Sheet, T } from '@/components/ui';
import { pickDateTime } from '@/components/pickers';
import { RemindersSheet } from '@/features/RemindersSheet';
import { SUBMISSION_OPTIONS, remindersLabel } from '@/features/fieldOptions';
import { getRecord, save } from '@/lib/db/repo';
import { useCourses } from '@/lib/db/queries';
import { useSettings, useTz } from '@/lib/store';
import { useTheme } from '@/lib/theme';

/** Edit all assignment fields: title, course, due, kind, submission, marks, reminders, notes & links, keep offline. */
export default function AssignmentEdit() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const { c } = useTheme();
  const tz = useTz();
  const settings = useSettings();
  const { active, byId } = useCourses();
  const original = getRecord('assignments', id);
  const [a, setA] = useState<Assignment | null>(original);
  const [sheet, setSheet] = useState<null | 'course' | 'submission' | 'reminders'>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  if (!a) return <Screen back>{null}</Screen>;
  const set = (p: Partial<Assignment>) => setA({ ...a, ...p });
  const now = Date.now();

  return (
    <Screen
      back
      footer={
        <PillButton
          title="Save"
          disabled={!a.title.trim()}
          onPress={() => {
            save('assignments', { ...a, title: a.title.trim() });
            router.back();
          }}
        />
      }
    >
      <Input value={a.title} onChangeText={(t) => set({ title: t })} big accessibilityLabel="Title" multiline />
      <Gap h={16} />
      <FieldRow label="Course" value={byId.get(a.courseId)?.shortName} onPress={() => setSheet('course')} />
      <FieldRow
        label="Due"
        value={a.dueAt ? `${formatDue(a.dueAt, now, tz)}${formatDue(a.dueAt, now, tz).includes(':') ? '' : ` ${formatHHMM(a.dueAt, tz)}`}` : 'None'}
        onPress={async () => {
          const t = await pickDateTime(a.dueAt ?? now, tz);
          if (t) set({ dueAt: t });
        }}
      />
      <FieldRow
        label="Kind"
        right={
          <Segmented
            options={[
              { value: 'individual', label: 'Individual' },
              { value: 'group', label: 'Group' },
            ]}
            value={a.kind}
            onChange={(k) => set({ kind: k, group: k === 'group' ? (a.group ?? { members: [], meetings: [] }) : a.group })}
          />
        }
      />
      <FieldRow label="Submission" value={SUBMISSION_LABELS[a.submission]} onPress={() => setSheet('submission')} />
      <FieldRow label="Reminders" value={remindersLabel(a.reminderOffsets)} onPress={() => setSheet('reminders')} />
      <FieldRow
        label="Marks"
        right={
          <Input
            value={a.marks != null ? String(a.marks) : ''}
            onChangeText={(t) => set({ marks: t.trim() ? Number(t.replace(',', '.')) || null : null })}
            keyboardType="decimal-pad"
            placeholder="—"
            style={{ width: 90, textAlign: 'right', backgroundColor: 'transparent' }}
            accessibilityLabel="Marks"
          />
        }
      />
      <FieldRow
        label="Keep offline"
        value={a.keepOffline === false ? 'Off' : a.keepOffline ? 'On' : 'Auto'}
        onPress={() => set({ keepOffline: a.keepOffline === null || a.keepOffline === undefined ? true : a.keepOffline ? false : null })}
      />

      <Gap h={28} />
      <T v="heading">Notes</T>
      <Gap h={8} />
      <Input value={a.notes} onChangeText={(t) => set({ notes: t })} multiline placeholder="Brief, rubric, anything" style={{ minHeight: 120, textAlignVertical: 'top' }} autoFocus={focus === 'notes'} accessibilityLabel="Notes" />
      <Gap h={20} />
      <T v="heading">Links</T>
      <Gap h={8} />
      {a.links.map((l, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 10 }}>
          <T style={{ flex: 1 }} numberOfLines={1} color={c.suggestion}>
            {l.title || l.url}
          </T>
          <Pressable accessibilityLabel="Remove link" hitSlop={12} onPress={() => set({ links: a.links.filter((_, j) => j !== i) })}>
            <X size={18} color={c.muted} />
          </Pressable>
        </View>
      ))}
      <View style={{ gap: 8 }}>
        <Input placeholder="https://…" value={linkUrl} onChangeText={setLinkUrl} autoCapitalize="none" keyboardType="url" accessibilityLabel="Link URL" />
        <Input
          placeholder="Title (optional)"
          value={linkTitle}
          onChangeText={setLinkTitle}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (!linkUrl.trim()) return;
            set({ links: [...a.links, { url: linkUrl.trim(), title: linkTitle.trim() }] });
            setLinkUrl('');
            setLinkTitle('');
          }}
          accessibilityLabel="Link title"
        />
      </View>

      <Sheet visible={sheet === 'course'} onClose={() => setSheet(null)} title="Course">
        <OptionList
          options={active.map((x) => ({ value: x.id, label: x.shortName, color: x.color }))}
          value={a.courseId}
          onSelect={(v) => {
            set({ courseId: v, semesterId: byId.get(v)?.semesterId ?? a.semesterId });
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet visible={sheet === 'submission'} onClose={() => setSheet(null)} title="Submission">
        <OptionList
          options={SUBMISSION_OPTIONS}
          value={a.submission}
          onSelect={(v) => {
            set({ submission: v });
            setSheet(null);
          }}
        />
      </Sheet>
      <RemindersSheet visible={sheet === 'reminders'} onClose={() => setSheet(null)} value={a.reminderOffsets} defaults={settings.reminders.dueOffsets} onChange={(v) => set({ reminderOffsets: v })} />
    </Screen>
  );
}
