import React, { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Camera, Paperclip, X } from 'lucide-react-native';
import { EXAM_TYPE_LABELS, HOUR, SPAN_COLORS, SUBMISSION_LABELS, formatDue, formatHHMM, type Course } from '@duely/shared';
import { FieldRow, Gap, IconButton, Input, OptionList, PillButton, Screen, Segmented, Sheet, T } from '@/components/ui';
import { pickDateTime } from '@/components/pickers';
import { RemindersSheet } from './RemindersSheet';
import { EXAM_TYPE_OPTIONS, SUBMISSION_OPTIONS, remindersLabel } from './fieldOptions';
import { useQuickAdd, type QuickAddValues } from './useQuickAdd';
import { FONTS, useTheme } from '@/lib/theme';

export interface StagedFile {
  uri: string;
  name: string;
  mime?: string | null;
  size?: number | null;
}

export interface QuickAddProps {
  courses: Course[];
  tz: string;
  defaultOffsets: string[];
  prefillCourseId?: string;
  onSave: (v: QuickAddValues, files: StagedFile[]) => Promise<void> | void;
  pickFiles?: () => Promise<StagedFile[]>;
  scan?: () => Promise<StagedFile | null>;
}

type SheetKind = null | 'course' | 'submission' | 'type' | 'reminders';

/** §11.3 #3 Quick add: smart text with live coloured spans → editable parsed rows. */
export function QuickAdd({ courses, tz, defaultOffsets, prefillCourseId, onSave, pickFiles, scan }: QuickAddProps) {
  const { c, scheme, course: courseColor } = useTheme();
  const qa = useQuickAdd(courses, tz, prefillCourseId);
  const v = qa.values;
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const course = courses.find((x) => x.id === v.courseId);
  const now = Date.now();

  // Coloured segments of the input (course = orange, date = blue, kind = teal).
  const segments: { text: string; color?: string }[] = [];
  let cursor = 0;
  for (const sp of v.parsed.spans) {
    if (sp.start > cursor) segments.push({ text: qa.text.slice(cursor, sp.start) });
    segments.push({ text: qa.text.slice(sp.start, sp.end), color: SPAN_COLORS[sp.kind][scheme] });
    cursor = sp.end;
  }
  if (cursor < qa.text.length) segments.push({ text: qa.text.slice(cursor) });

  const dueLabel = v.dueAt ? `${formatDue(v.dueAt, now, tz)}${formatDue(v.dueAt, now, tz).includes(':') ? '' : ` ${formatHHMM(v.dueAt, tz)}`}` : 'None';

  async function save() {
    setSaving(true);
    try {
      await onSave(v, files);
    } catch (e) {
      Alert.alert('Couldn’t save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      padTop={false}
      right={
        <IconButton label="Close" onPress={() => router.back()}>
          <X size={20} color={c.text} />
        </IconButton>
      }
      footer={<PillButton title="Save" onPress={save} disabled={!v.valid} loading={saving} />}
    >
      <Segmented
        options={[
          { value: 'assignment', label: 'Assignment' },
          { value: 'exam', label: 'Exam' },
        ]}
        value={v.mode}
        onChange={(m) => qa.override({ mode: m })}
      />
      <Gap h={24} />
      <TextInput
        testID="quick-add-input"
        accessibilityLabel="Describe it"
        autoFocus
        multiline
        placeholder={v.mode === 'exam' ? 'Networks midterm 20 nov 8am' : 'PL/SQL lab on cursors fri 5pm group'}
        placeholderTextColor={c.faint}
        onChangeText={qa.setText}
        style={{ fontFamily: FONTS.display, fontSize: 28, lineHeight: 36, color: c.text, minHeight: 110, textAlignVertical: 'top', padding: 0 }}
      >
        {segments.map((s, i) => (
          <Text key={i} style={s.color ? { color: s.color } : undefined}>
            {s.text}
          </Text>
        ))}
      </TextInput>
      <Gap h={16} />
      <FieldRow
        testID="row-course"
        label="Course"
        value={course?.shortName ?? 'Choose'}
        valueColor={course ? courseColor(course.color) : c.faint}
        onPress={() => setSheet('course')}
      />
      <FieldRow
        testID="row-due"
        label={v.mode === 'exam' ? 'When' : 'Due'}
        value={dueLabel}
        valueColor={v.dueAt ? SPAN_COLORS.date[scheme] : c.faint}
        onPress={async () => {
          const t = await pickDateTime(v.dueAt ?? now + 24 * HOUR, tz);
          if (t) qa.override({ dueAt: t });
        }}
      />
      {v.mode === 'assignment' ? (
        <>
          <FieldRow
            testID="row-kind"
            label="Kind"
            value={v.kind === 'group' ? 'Group' : 'Individual'}
            valueColor={v.parsed.kind ? SPAN_COLORS.kind[scheme] : undefined}
            onPress={() => qa.override({ kind: v.kind === 'group' ? 'individual' : 'group' })}
          />
          <FieldRow label="Submission" value={SUBMISSION_LABELS[v.submission]} onPress={() => setSheet('submission')} />
          <FieldRow label="Reminders" value={remindersLabel(v.reminderOffsets)} onPress={() => setSheet('reminders')} />
        </>
      ) : (
        <>
          <FieldRow testID="row-type" label="Type" value={EXAM_TYPE_LABELS[v.examType]} onPress={() => setSheet('type')} />
          <FieldRow label="Room" right={<Input value={v.room ?? ''} onChangeText={(t) => qa.override({ room: t })} placeholder="—" style={{ width: 120, textAlign: 'right', backgroundColor: 'transparent' }} accessibilityLabel="Room" />} />
        </>
      )}
      <Gap h={20} />
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {pickFiles ? (
          <IconButton label="Attach" onPress={async () => setFiles([...files, ...(await pickFiles())])}>
            <Paperclip size={20} color={c.text} />
          </IconButton>
        ) : null}
        {scan ? (
          <IconButton
            label="Scan"
            onPress={async () => {
              const f = await scan();
              if (f) setFiles([...files, f]);
            }}
          >
            <Camera size={20} color={c.text} />
          </IconButton>
        ) : null}
        {files.length ? <T v="small" tone="muted">{files.length === 1 ? files[0]!.name : `${files.length} files`}</T> : null}
      </View>

      <Sheet visible={sheet === 'course'} onClose={() => setSheet(null)} title="Course">
        <OptionList
          options={courses.map((x) => ({ value: x.id, label: x.shortName, color: x.color }))}
          value={v.courseId}
          onSelect={(id) => {
            qa.override({ courseId: id });
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet visible={sheet === 'submission'} onClose={() => setSheet(null)} title="Submission">
        <OptionList
          options={SUBMISSION_OPTIONS}
          value={v.submission}
          onSelect={(s) => {
            qa.override({ submission: s });
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet visible={sheet === 'type'} onClose={() => setSheet(null)} title="Type">
        <OptionList
          options={EXAM_TYPE_OPTIONS}
          value={v.examType}
          onSelect={(s) => {
            qa.override({ examType: s });
            setSheet(null);
          }}
        />
      </Sheet>
      <RemindersSheet visible={sheet === 'reminders'} onClose={() => setSheet(null)} value={v.reminderOffsets} defaults={defaultOffsets} onChange={(r) => qa.override({ reminderOffsets: r })} />
    </Screen>
  );
}
