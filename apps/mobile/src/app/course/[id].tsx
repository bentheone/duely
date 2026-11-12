import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Plus, RefreshCw, X } from 'lucide-react-native';
import { COURSE_PALETTE, WEEKDAY_SHORT, formatHHMM, parseHHMM, zonedDayAt, type ClassSlot } from '@duely/shared';
import { Chip, FieldRow, Gap, IconButton, Input, PillButton, Screen, Segmented, Sheet, SmallButton, T } from '@/components/ui';
import { pickTime } from '@/components/pickers';
import { finishCourse, nextColor, upsertCourse } from '@/features/actions';
import { getRecord, save } from '@/lib/db/repo';
import { syncNow } from '@/lib/sync/engine';
import { useApp, useTz } from '@/lib/store';
import { useTheme } from '@/lib/theme';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const minutes = (hhmm: string) => {
  const { h, m } = parseHHMM(hhmm);
  return h * 60 + m;
};

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
  const [slots, setSlots] = useState<ClassSlot[]>(existing?.schedule ?? []);
  const [toGoogle, setToGoogle] = useState(!!existing?.scheduleToGoogle);
  const [slotSheet, setSlotSheet] = useState(false);
  const [draft, setDraft] = useState<ClassSlot>({ weekday: 1, start: '08:00', end: '10:00', room: null });
  const tz = useTz();
  const googleConnected = useApp((s) => s.googleConnected);

  const addRule = () => {
    const r = rule.trim().toLowerCase();
    if (r && !rules.includes(r)) setRules([...rules, r]);
    setRule('');
  };

  const pick = async (which: 'start' | 'end') => {
    const t = await pickTime(zonedDayAt(Date.now(), tz, 0, draft[which]), tz);
    if (!t) return;
    const v = formatHHMM(t, tz);
    setDraft((d) => {
      const next = { ...d, [which]: v };
      // Keep end after start (default 2 h class).
      if (which === 'start' && minutes(next.end) <= minutes(v)) next.end = formatHHMM(t + 2 * 3600_000, tz);
      return next;
    });
  };

  function saveCourse() {
    const pending = rule.trim().toLowerCase();
    const allRules = pending && !rules.includes(pending) ? [...rules, pending] : rules;
    const sorted = [...slots].sort((a, b) => WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday) || minutes(a.start) - minutes(b.start));
    const scheduleChanged = JSON.stringify(sorted) !== JSON.stringify(existing?.schedule ?? []) || toGoogle !== !!existing?.scheduleToGoogle;
    upsertCourse({
      id: existing?.id,
      shortName: shortName.trim(),
      code: code.trim(),
      title: title.trim() || shortName.trim(),
      room: room.trim() || null,
      lecturer: lecturer.trim() || null,
      group: group.trim() || null,
      color,
      matchRules: allRules,
      schedule: sorted.length ? sorted : null,
      scheduleToGoogle: sorted.length ? toGoogle : false,
    });
    // The server turns class times into classes (and Google events) — push now rather than in 2 s.
    if (scheduleChanged) void syncNow({ forceGoogle: true });
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
          placeholder="Add rule (e.g. database)"
          value={rule}
          onChangeText={setRule}
          autoCapitalize="none"
          submitBehavior="submit"
          returnKeyType="done"
          onSubmitEditing={addRule}
          accessibilityLabel="New match rule"
        />
        <IconButton label="Add rule" onPress={addRule} style={{ width: 52, height: 52, borderRadius: 14 }}>
          <Plus size={20} color={rule.trim() ? c.text : c.faint} />
        </IconButton>
      </View>

      <Gap h={32} />
      <T v="heading">Class times</T>
      <T v="small" tone="muted">
        Weekly times for alarms, Today and lecture reminders — if your school calendar doesn’t have them.
      </T>
      <Gap h={8} />
      {slots.map((sl, i) => (
        <View key={`${sl.weekday}-${sl.start}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 12 }}>
          <T v="item" style={{ width: 48 }}>
            {WEEKDAY_SHORT[sl.weekday]}
          </T>
          <T style={{ flex: 1 }} tone="muted">
            {sl.start}–{sl.end}
            {sl.room ? ` · ${sl.room}` : ''}
          </T>
          <IconButton label={`Remove ${WEEKDAY_SHORT[sl.weekday]} ${sl.start}`} size={36} filled={false} onPress={() => setSlots(slots.filter((_, k) => k !== i))}>
            <X size={16} color={c.muted} />
          </IconButton>
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          const last = slots[slots.length - 1];
          setDraft({ weekday: last ? WEEK_ORDER[(WEEK_ORDER.indexOf(last.weekday) + 1) % 7]! : 1, start: last?.start ?? '08:00', end: last?.end ?? '10:00', room: last?.room ?? (room.trim() || null) });
          setSlotSheet(true);
        }}
        style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <Plus size={18} color={c.muted} />
        <T tone="muted">Add class time</T>
      </Pressable>
      {slots.length ? (
        <>
          <Gap h={8} />
          <Segmented
            options={[
              { value: 'app', label: 'Only in Duely' },
              { value: 'google', label: 'Google Calendar too' },
            ]}
            value={toGoogle ? 'google' : 'app'}
            onChange={(v) => setToGoogle(v === 'google')}
          />
          {toGoogle && !googleConnected ? (
            <T v="small" tone="danger" style={{ marginTop: 8 }}>
              Connect Google in Settings first.
            </T>
          ) : null}
          {existing?.scheduleToGoogle && toGoogle ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                save('courses', { id: existing.id, scheduleRev: (existing.scheduleRev ?? 0) + 1 });
                void syncNow({ forceGoogle: true });
              }}
              style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}
            >
              <RefreshCw size={16} color={c.muted} />
              <T tone="muted">Resync calendar{existing.scheduleGoogleEventIds?.length ? '' : ' · not on Google yet'}</T>
            </Pressable>
          ) : null}
        </>
      ) : null}

      <Sheet visible={slotSheet} onClose={() => setSlotSheet(false)} title="Class time">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {WEEK_ORDER.map((w) => (
            <Chip key={w} label={WEEKDAY_SHORT[w]!} selected={draft.weekday === w} onPress={() => setDraft({ ...draft, weekday: w })} />
          ))}
        </View>
        <Gap h={12} />
        <FieldRow label="Starts" value={draft.start} onPress={() => void pick('start')} />
        <FieldRow label="Ends" value={draft.end} onPress={() => void pick('end')} />
        <Gap h={12} />
        <Input placeholder="Room (optional)" value={draft.room ?? ''} onChangeText={(t) => setDraft({ ...draft, room: t || null })} accessibilityLabel="Room for this class" />
        <Gap h={20} />
        <PillButton
          title="Add"
          disabled={minutes(draft.end) <= minutes(draft.start)}
          onPress={() => {
            setSlots([...slots.filter((x) => !(x.weekday === draft.weekday && x.start === draft.start)), { ...draft, room: draft.room?.trim() || null }]);
            setSlotSheet(false);
          }}
        />
      </Sheet>
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
