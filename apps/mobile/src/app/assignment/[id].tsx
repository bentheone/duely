import React, { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Minus, MoreHorizontal, Plus, Share2 } from 'lucide-react-native';
import {
  HOUR,
  STATUS_LABELS,
  SUBMISSION_LABELS,
  computeProgress,
  formatDue,
  formatHHMM,
  formatShortDate,
  isAssignmentOpen,
  type Assignment,
} from '@duely/shared';
import { Checkbox, CourseLabel, Empty, Gap, IconButton, Input, OptionList, PillButton, ProgressBar, Screen, Segmented, Sheet, SmallButton, T } from '@/components/ui';
import { FileTiles } from '@/components/FileTiles';
import { pickDateTime } from '@/components/pickers';
import { addSubtask, setStatus, toggleSubtask } from '@/features/actions';
import { useAssignment, useCourses, useSessions, useSubtasks } from '@/lib/db/queries';
import { remove, save } from '@/lib/db/repo';
import { useTz } from '@/lib/store';
import { shareItem } from '@/lib/share';
import { FONTS, useTheme } from '@/lib/theme';

type SheetKind = null | 'menu' | 'status' | 'grade' | 'progress';

/** §11.3 #4 Assignment screen. */
export default function AssignmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const tz = useTz();
  const a = useAssignment(id);
  const subtasks = useSubtasks(id);
  const sessions = useSessions();
  const { byId } = useCourses();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [newSub, setNewSub] = useState('');
  const [grade, setGrade] = useState('');
  const now = Date.now();

  const upcoming = useMemo(() => sessions.filter((s) => s.assignmentId === id && s.end > now && s.status === 'confirmed'), [sessions, id, now]);

  if (!a) {
    return (
      <Screen back>
        <Empty title="Assignment not found" />
      </Screen>
    );
  }
  const course = byId.get(a.courseId);
  const progress = computeProgress(a, subtasks);
  const urgent = isAssignmentOpen(a) && a.dueAt != null && a.dueAt - now <= 24 * HOUR;
  const nextMeeting = a.group?.meetings.filter((m) => m.at > now).sort((x, y) => x.at - y.at)[0];
  const update = (p: Partial<Assignment>) => save('assignments', { id: a.id, ...p });

  return (
    <Screen
      back
      right={
        <>
          <IconButton
            label="Share with a friend"
            onPress={() => shareItem('assignment', a.id, a.title).catch((e: Error) => Alert.alert('Couldn’t share', e.message))}
          >
            <Share2 size={20} color={c.text} />
          </IconButton>
          <IconButton label="More" onPress={() => setSheet('menu')}>
            <MoreHorizontal size={20} color={c.text} />
          </IconButton>
        </>
      }
      footer={isAssignmentOpen(a) && a.dueAt ? <PillButton title="Plan a session" onPress={() => router.push({ pathname: '/calendar', params: { assignmentId: a.id } })} /> : undefined}
    >
      {course ? <CourseLabel color={course.color} name={course.shortName} suffix={a.kind === 'group' ? 'Group' : undefined} /> : null}
      <Gap h={10} />
      <T v="title">{a.title}</T>
      <Gap h={8} />
      <Pressable
        accessibilityRole="button"
        onPress={async () => {
          const t = await pickDateTime(a.dueAt ?? now + 24 * HOUR, tz);
          if (t) update({ dueAt: t });
        }}
      >
        <T tone={urgent ? 'danger' : 'muted'}>
          {a.dueAt ? `Due ${formatDue(a.dueAt, now, tz)}${formatDue(a.dueAt, now, tz).includes(':') ? '' : ` · ${formatHHMM(a.dueAt, tz)}`}` : 'No due date'}
          {` · ${SUBMISSION_LABELS[a.submission]}`}
          {a.marks ? ` · ${a.marks} marks` : ''}
        </T>
      </Pressable>
      {a.status !== 'not_started' && a.status !== 'in_progress' ? (
        <T v="small" tone="muted" style={{ marginTop: 4 }}>
          {STATUS_LABELS[a.status]}
          {a.grade ? ` · ${a.grade}` : ''}
        </T>
      ) : null}

      <Gap h={28} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Progress ${progress}%`} onPress={() => setSheet('progress')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 }}>
        <ProgressBar value={progress} color={course?.color} />
        <T style={{ fontFamily: FONTS.display, fontSize: 18, width: 52, textAlign: 'right' }}>{progress}%</T>
      </Pressable>

      <Gap h={16} />
      {subtasks.map((s) => (
        <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 }}>
          <Checkbox checked={s.done} onToggle={() => toggleSubtask(s)} label={s.title} />
          <Pressable
            style={{ flex: 1 }}
            onLongPress={() =>
              Alert.alert(s.title, undefined, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => remove('subtasks', s.id) },
              ])
            }
          >
            <T tone={s.done ? 'faint' : undefined} style={s.done ? { textDecorationLine: 'line-through' } : undefined}>
              {s.title}
            </T>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Set date for ${s.title}`}
            hitSlop={10}
            onPress={async () => {
              const t = await pickDateTime(s.dueAt ?? a.dueAt ?? now, tz, { withTime: false });
              if (t) save('subtasks', { id: s.id, dueAt: t });
            }}
          >
            <T v="meta" tone={s.done ? 'faint' : s.dueAt && s.dueAt < now ? 'danger' : 'muted'}>
              {s.dueAt ? formatShortDate(s.dueAt, tz).replace(/^\w+ /, '') : '＋ date'}
            </T>
          </Pressable>
        </View>
      ))}
      <Input
        placeholder="Add a step"
        value={newSub}
        onChangeText={setNewSub}
        returnKeyType="done"
        onSubmitEditing={() => {
          if (newSub.trim()) addSubtask(a.id, newSub.trim());
          setNewSub('');
        }}
        style={{ marginTop: 8, backgroundColor: 'transparent', paddingHorizontal: 0 }}
        accessibilityLabel="Add a subtask"
      />

      {a.kind === 'group' ? (
        <>
          <Gap h={28} />
          <Pressable accessibilityRole="button" accessibilityLabel="Group details" onPress={() => router.push(`/assignment-group/${a.id}`)}>
            <View style={{ flexDirection: 'row' }}>
              {(a.group?.members ?? []).slice(0, 6).map((m, i) => (
                <View
                  key={i}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: m.isMe ? c.primaryBg : c.surfaceButton, marginLeft: i ? -8 : 0, borderWidth: 2, borderColor: c.bg, alignItems: 'center', justifyContent: 'center' }}
                >
                  <T v="small" color={m.isMe ? c.primaryText : c.text}>
                    {m.name.slice(0, 1).toUpperCase()}
                  </T>
                </View>
              ))}
              {!a.group?.members.length ? <T tone="muted">Add group members</T> : null}
            </View>
            {nextMeeting ? (
              <T v="meta" tone="muted" style={{ marginTop: 8 }}>
                Meeting {formatDue(nextMeeting.at, now, tz)}
                {formatDue(nextMeeting.at, now, tz).includes(':') ? '' : ` ${formatHHMM(nextMeeting.at, tz)}`}
                {nextMeeting.place ? ` · ${nextMeeting.place}` : ''}
              </T>
            ) : null}
            {a.group?.myPart ? (
              <T v="meta" style={{ marginTop: 4 }}>
                My part: {a.group.myPart}
              </T>
            ) : null}
          </Pressable>
        </>
      ) : null}

      {upcoming.length ? (
        <>
          <Gap h={28} />
          {upcoming.map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 40, alignItems: 'center', backgroundColor: c.suggestionBg, borderRadius: 14, paddingHorizontal: 14, marginBottom: 8 }}>
              <T v="meta">{formatShortDate(s.start, tz)}</T>
              <T v="meta" tone="muted">
                {formatHHMM(s.start, tz)}–{formatHHMM(s.end, tz)}
              </T>
            </View>
          ))}
        </>
      ) : null}

      <Gap h={28} />
      <FileTiles ownerType="assignment" ownerId={a.id} />

      {a.notes || a.links.length ? (
        <>
          <Gap h={28} />
          {a.notes ? <T style={{ lineHeight: 22 }}>{a.notes}</T> : null}
          {a.links.map((l, i) => (
            <Pressable key={i} accessibilityRole="link" onPress={() => void Linking.openURL(l.url)} style={{ minHeight: 44, justifyContent: 'center' }}>
              <T color={c.suggestion}>{l.title || l.url}</T>
            </Pressable>
          ))}
        </>
      ) : null}

      {/* ---- sheets ---- */}
      <Sheet visible={sheet === 'menu'} onClose={() => setSheet(null)}>
        <OptionList
          options={[
            { value: 'edit', label: 'Edit' },
            { value: 'status', label: 'Status' },
            { value: 'notes', label: 'Notes & links' },
            { value: 'grade', label: 'Grade' },
            { value: 'delete', label: 'Delete' },
          ]}
          onSelect={(v) => {
            if (v === 'edit' || v === 'notes') {
              setSheet(null);
              router.push({ pathname: '/assignment-edit/[id]', params: { id: a.id, focus: v } });
            } else if (v === 'status') setSheet('status');
            else if (v === 'grade') {
              setGrade(a.grade ?? '');
              setSheet('grade');
            } else {
              setSheet(null);
              Alert.alert('Delete assignment?', a.title, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    remove('assignments', a.id);
                    router.back();
                  },
                },
              ]);
            }
          }}
        />
      </Sheet>
      <Sheet visible={sheet === 'status'} onClose={() => setSheet(null)} title="Status">
        <OptionList
          options={(Object.keys(STATUS_LABELS) as Assignment['status'][]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          value={a.status}
          onSelect={(s) => {
            setStatus(a.id, s);
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet visible={sheet === 'grade'} onClose={() => setSheet(null)} title="Grade">
        <Input value={grade} onChangeText={setGrade} placeholder={a.marks ? `out of ${a.marks}` : 'e.g. 18/20'} autoFocus accessibilityLabel="Grade" />
        <Gap h={16} />
        <PillButton
          title="Save"
          onPress={() => {
            update({ grade: grade.trim() || null, status: grade.trim() ? 'graded' : a.status });
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet visible={sheet === 'progress'} onClose={() => setSheet(null)} title="Progress">
        <Segmented
          options={[
            { value: 'auto', label: 'From steps' },
            { value: 'manual', label: 'Manual' },
          ]}
          value={a.progressMode}
          onChange={(m) => update({ progressMode: m, progressManual: m === 'manual' ? (a.progressManual ?? progress) : a.progressManual })}
        />
        {a.progressMode === 'manual' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginTop: 24 }}>
            <IconButton label="Decrease" onPress={() => update({ progressManual: Math.max(0, (a.progressManual ?? 0) - 10) })}>
              <Minus size={20} color={c.text} />
            </IconButton>
            <T style={{ fontFamily: FONTS.display, fontSize: 40 }}>{a.progressManual ?? 0}%</T>
            <IconButton label="Increase" onPress={() => update({ progressManual: Math.min(100, (a.progressManual ?? 0) + 10) })}>
              <Plus size={20} color={c.text} />
            </IconButton>
          </View>
        ) : null}
        <Gap h={20} />
        <SmallButton title="Done" onPress={() => setSheet(null)} />
      </Sheet>
    </Screen>
  );
}
