import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { COURSE_PALETTE } from '@duely/shared';
import { Gap, Input, PillButton, Screen, SmallButton, T } from '@/components/ui';
import { finishCourse, nextColor, upsertCourse } from '@/features/actions';
import { getRecord } from '@/lib/db/repo';
import { useTheme } from '@/lib/theme';

/** Edit course: short name, colour, code, title, room, lecturer, group, match rules. */
export default function CourseEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, course: courseColor } = useTheme();
  const isNew = id === 'new';
  const existing = isNew ? null : getRecord('courses', id);
  const [shortName, setShortName] = useState(existing?.shortName ?? '');
  const [code, setCode] = useState(existing?.code ?? '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [room, setRoom] = useState(existing?.room ?? '');
  const [lecturer, setLecturer] = useState(existing?.lecturer ?? '');
  const [group, setGroup] = useState(existing?.group ?? '');
  const [color, setColor] = useState(existing?.color ?? nextColor());
  const [rules, setRules] = useState<string[]>(existing?.matchRules ?? []);
  const [rule, setRule] = useState('');

  function saveCourse() {
    upsertCourse({
      id: existing?.id,
      shortName: shortName.trim(),
      code: code.trim(),
      title: title.trim() || shortName.trim(),
      room: room.trim() || null,
      lecturer: lecturer.trim() || null,
      group: group.trim() || null,
      color,
      matchRules: rules,
    });
    router.back();
  }

  return (
    <Screen back footer={<PillButton title="Save" onPress={saveCourse} disabled={!shortName.trim()} />}>
      <T v="display">{isNew ? 'New course' : existing?.shortName}</T>
      <Gap h={24} />
      <View style={{ gap: 12 }}>
        <Input placeholder="Short name (e.g. PL/SQL)" value={shortName} onChangeText={setShortName} maxLength={24} accessibilityLabel="Short name" big />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 6 }}>
          {COURSE_PALETTE.map((p) => (
            <Pressable
              key={p.key}
              accessibilityRole="radio"
              accessibilityLabel={p.key}
              accessibilityState={{ selected: color === p.light }}
              onPress={() => setColor(p.light)}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: color === p.light ? 2 : 0, borderColor: c.text }}
            >
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: courseColor(p.light) }} />
            </Pressable>
          ))}
        </View>
        <Input placeholder="Code (INSY 8311)" value={code} onChangeText={setCode} autoCapitalize="characters" accessibilityLabel="Course code" />
        <Input placeholder="Full title" value={title} onChangeText={setTitle} accessibilityLabel="Full title" />
        <Input placeholder="Room" value={room} onChangeText={setRoom} accessibilityLabel="Room" />
        <Input placeholder="Lecturer" value={lecturer} onChangeText={setLecturer} accessibilityLabel="Lecturer" />
        <Input placeholder="Group (e.g. F)" value={group} onChangeText={setGroup} accessibilityLabel="Group" />
      </View>
      <Gap h={28} />
      <T v="heading">Match rules</T>
      <T v="small" tone="muted">
        Words that link calendar events and quick-add text to this course.
      </T>
      <Gap h={12} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {rules.map((r) => (
          <Pressable
            key={r}
            accessibilityRole="button"
            accessibilityLabel={`Remove rule ${r}`}
            onPress={() => setRules(rules.filter((x) => x !== r))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surface, borderRadius: 16, paddingHorizontal: 12, minHeight: 36 }}
          >
            <T v="small">{r}</T>
            <X size={14} color={c.muted} />
          </Pressable>
        ))}
      </View>
      <Gap h={12} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Input
          style={{ flex: 1 }}
          placeholder="Add rule"
          value={rule}
          onChangeText={setRule}
          autoCapitalize="none"
          onSubmitEditing={() => {
            const r = rule.trim().toLowerCase();
            if (r && !rules.includes(r)) setRules([...rules, r]);
            setRule('');
          }}
          accessibilityLabel="New match rule"
        />
      </View>
      {existing && existing.status === 'active' ? (
        <>
          <Gap h={32} />
          <SmallButton
            title="Finish course"
            onPress={() => {
              finishCourse(existing.id);
              router.back();
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}
