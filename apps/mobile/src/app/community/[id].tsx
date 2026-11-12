import React, { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { MoreHorizontal, QrCode } from 'lucide-react-native';
import {
  EXAM_TYPE_LABELS,
  MONTH_SHORT,
  formatDue,
  formatHHMM,
  formatShortDate,
  isAssignmentOpen,
  zonedParts,
  type Community,
  type CommunityPost,
  type SharedItem,
} from '@duely/shared';
import { CourseLabel, Empty, Gap, IconButton, Input, OptionList, PillButton, Screen, Segmented, Sheet, SmallButton, T } from '@/components/ui';
import { upsertCourse } from '@/features/actions';
import { api, ApiError } from '@/lib/api';
import { courseForCode } from '@/lib/community';
import { useAllCourses, useAssignments, useExams, useLectures, useSessions } from '@/lib/db/queries';
import { getMetaJson } from '@/lib/db/repo';
import { saveShared } from '@/lib/share';
import { pendingCount, syncNow } from '@/lib/sync/engine';
import { useApp, useTz } from '@/lib/store';
import { useTheme } from '@/lib/theme';

type PostKind = 'assignment' | 'exam' | 'lecture' | 'session' | 'resource';
const KIND_LABEL: Record<SharedItem['kind'], string> = { assignment: 'Assignment', exam: 'Exam', lecture: 'Lecture notes', session: 'Study session', resource: 'Resource' };

function itemTitle(it: SharedItem): string {
  return it.assignment?.title ?? (it.exam ? EXAM_TYPE_LABELS[it.exam.type] : null) ?? it.lecture?.title ?? it.lecture?.topics[0] ?? it.session?.title ?? it.resource?.title ?? 'Shared item';
}
function itemMeta(it: SharedItem, tz: string): string {
  const now = Date.now();
  if (it.assignment) return [it.assignment.dueAt != null ? `Due ${formatDue(it.assignment.dueAt, now, tz)}` : null, it.assignment.kind === 'group' ? 'Group' : null, it.assignment.subtasks.length ? `${it.assignment.subtasks.length} steps` : null].filter(Boolean).join(' · ');
  if (it.exam) return `${formatShortDate(it.exam.startsAt, tz)} ${formatHHMM(it.exam.startsAt, tz)}${it.exam.room ? ` · ${it.exam.room}` : ''}`;
  if (it.lecture) return [formatShortDate(it.lecture.at, tz), it.lecture.topics.slice(0, 3).join(', ')].filter(Boolean).join(' · ');
  if (it.session) return `${formatShortDate(it.session.start, tz)} ${formatHHMM(it.session.start, tz)}–${formatHHMM(it.session.end, tz)}`;
  if (it.resource) return [it.resource.note, it.resource.url].filter(Boolean).join(' · ');
  return '';
}

/** A course community: shared feed (save to my Duely), post my items, invite by QR / link. */
export default function CommunityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const tz = useTz();
  const online = useApp((s) => s.online);
  const qc = useQueryClient();
  const all = useAllCourses();
  const assignments = useAssignments();
  const exams = useExams();
  const lectures = useLectures();
  const sessions = useSessions();
  const [sheet, setSheet] = useState<null | 'invite' | 'post' | 'members' | 'more'>(null);
  const [kind, setKind] = useState<PostKind>('assignment');
  const [res, setRes] = useState({ title: '', url: '', note: '' });
  const [, bump] = useState(0);

  const com = useQuery({ queryKey: ['community', id], queryFn: () => api<Community>(`/communities/${id}`), enabled: !!id && online });
  const posts = useQuery({ queryKey: ['community', id, 'posts'], queryFn: () => api<CommunityPost[]>(`/communities/${id}/posts`), enabled: !!id && online });
  const cm = com.data;
  const myCourse = cm ? courseForCode(cm.course.code, all) : null;

  const refresh = () => Promise.all([com.refetch(), posts.refetch()]);

  const post = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (pendingCount() > 0) await syncNow();
      return api<CommunityPost>(`/communities/${id}/posts`, { body });
    },
    onSuccess: () => {
      setSheet(null);
      setRes({ title: '', url: '', note: '' });
      void qc.invalidateQueries({ queryKey: ['community', id, 'posts'] });
    },
    onError: (e) => Alert.alert('Couldn’t post', e instanceof ApiError && e.status === 404 ? 'It hasn’t synced yet. Try again in a moment.' : (e as Error).message),
  });

  // My items in this community's course, newest/upcoming first.
  const mine = useMemo(() => {
    if (!myCourse) return { assignment: [], exam: [], lecture: [], session: [] } as Record<Exclude<PostKind, 'resource'>, { value: string; label: string; hint?: string }[]>;
    const now = Date.now();
    const asg = assignments.filter((a) => a.courseId === myCourse.id);
    const ex = exams.filter((e) => e.courseId === myCourse.id);
    const ids = new Set([...asg.map((a) => a.id), ...ex.map((e) => e.id)]);
    return {
      assignment: asg
        .filter(isAssignmentOpen)
        .map((a) => ({ value: a.id, label: a.title, hint: a.dueAt ? `Due ${formatDue(a.dueAt, now, tz)}` : undefined })),
      exam: ex.filter((e) => e.startsAt > now - 86400000).map((e) => ({ value: e.id, label: EXAM_TYPE_LABELS[e.type], hint: `${formatShortDate(e.startsAt, tz)} ${formatHHMM(e.startsAt, tz)}` })),
      lecture: lectures.filter((l) => l.courseId === myCourse.id).map((l) => ({ value: l.id, label: l.title || l.topics[0] || 'Lecture', hint: formatShortDate(l.at, tz) })),
      session: sessions
        .filter((s) => s.status === 'confirmed' && s.end > now && ((s.assignmentId && ids.has(s.assignmentId)) || (s.examId && ids.has(s.examId))))
        .map((s) => ({ value: s.id, label: s.title, hint: `${formatShortDate(s.start, tz)} ${formatHHMM(s.start, tz)}` })),
    };
  }, [myCourse, assignments, exams, lectures, sessions, tz]);

  function saveItem(p: CommunityPost) {
    const run = (courseId: string | null) => {
      const s = saveShared(p.item, courseId, { files: (fid) => `/communities/${id}/posts/${p.id}/files/${fid}`, metaKey: `cpost:${p.id}` });
      bump((n) => n + 1);
      if (p.item.kind === 'session') Alert.alert('Saved', 'It’s on your calendar (Google too, after the next sync).');
      else router.push(s.kind === 'exam' ? `/exam/${s.id}` : s.kind === 'lecture' ? `/lecture/${s.id}` : `/assignment/${s.id}`);
    };
    if (myCourse) return run(myCourse.id);
    if (!cm) return;
    Alert.alert(`Add ${cm.course.shortName} first?`, `Saved items go into ${cm.course.code}, which isn’t on your account.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add course', onPress: () => run(upsertCourse({ shortName: cm.course.shortName, code: cm.course.code, title: cm.course.title, color: cm.course.color }).id) },
    ]);
  }

  if (!online && !cm) {
    return (
      <Screen back>
        <T v="display">Community</T>
        <Gap h={12} />
        <T tone="muted">You’re offline. Communities need the internet.</T>
      </Screen>
    );
  }
  if (!cm) {
    return (
      <Screen back>
        <T tone={com.error ? 'danger' : 'muted'}>{com.error ? (com.error as Error).message : 'Loading…'}</T>
      </Screen>
    );
  }

  const list = posts.data ?? [];
  return (
    <Screen
      back
      onRefresh={refresh}
      right={
        <>
          <IconButton label="Invite with QR code" onPress={() => setSheet('invite')}>
            <QrCode size={20} color={c.text} />
          </IconButton>
          <IconButton label="More" onPress={() => setSheet('more')}>
            <MoreHorizontal size={20} color={c.text} />
          </IconButton>
        </>
      }
      footer={<PillButton title="Share something" onPress={() => setSheet('post')} />}
    >
      <CourseLabel color={cm.course.color} name={cm.course.shortName} suffix={cm.course.code} />
      <Gap h={8} />
      <T v="display">{cm.name}</T>
      <Pressable accessibilityRole="button" onPress={() => setSheet('members')}>
        <T tone="muted">
          {cm.members.length} {cm.members.length === 1 ? 'member' : 'members'} ›
        </T>
      </Pressable>
      <Gap h={24} />

      {posts.isLoading ? <T tone="muted">Loading…</T> : null}
      {!posts.isLoading && !list.length ? <Empty title="Nothing shared yet" hint="Share an assignment, lecture notes, a study session or a past paper." /> : null}
      {list.map((p) => {
        const saved = getMetaJson<{ kind: string; id: string } | null>(`cpost:${p.id}`, null);
        const d = zonedParts(p.createdAt, tz);
        return (
          <Pressable
            key={p.id}
            onLongPress={() =>
              (p.mine || cm.isOwner) &&
              Alert.alert('Remove from community?', undefined, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () => void api(`/communities/${id}/posts/${p.id}`, { method: 'DELETE' }).then(() => posts.refetch()),
                },
              ])
            }
            style={{ paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: c.border, gap: 6 }}
          >
            <T v="small" tone="muted">
              {p.mine ? 'You' : p.author.name.split(' ')[0]} · {KIND_LABEL[p.item.kind]} · {d.day} {MONTH_SHORT[d.month - 1]}
            </T>
            <T v="item">{itemTitle(p.item)}</T>
            {itemMeta(p.item, tz) ? (
              <T v="meta" tone="muted" numberOfLines={2}>
                {itemMeta(p.item, tz)}
              </T>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              {p.item.kind === 'resource' ? (
                p.item.resource?.url ? <SmallButton title="Open link" onPress={() => void Linking.openURL(p.item.resource!.url!)} /> : null
              ) : saved ? (
                <SmallButton
                  title={p.item.kind === 'session' ? 'Saved ✓' : 'Saved · Open'}
                  onPress={() => saved.kind !== 'session' && router.push(saved.kind === 'exam' ? `/exam/${saved.id}` : saved.kind === 'lecture' ? `/lecture/${saved.id}` : `/assignment/${saved.id}`)}
                />
              ) : !p.mine ? (
                <SmallButton title={p.item.kind === 'session' ? 'Add to my calendar' : 'Save to my Duely'} tone="primary" onPress={() => saveItem(p)} />
              ) : null}
            </View>
          </Pressable>
        );
      })}

      <Sheet visible={sheet === 'invite'} onClose={() => setSheet(null)} title="Invite classmates">
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <View style={{ padding: 16, borderRadius: 20, backgroundColor: '#FFFFFF' }}>
            <QRCode value={cm.inviteUrl} size={200} color="#111317" backgroundColor="#FFFFFF" />
          </View>
          <Gap h={12} />
          <T v="small" tone="muted" style={{ textAlign: 'center' }}>
            They scan it with their phone camera — Duely opens and asks to join.
          </T>
        </View>
        <Gap h={16} />
        <OptionList
          options={[
            { value: 'share', label: 'Share invite link' },
            { value: 'copy', label: 'Copy link' },
            ...(cm.isOwner ? [{ value: 'reset', label: 'Reset link', hint: 'Old QR codes and links stop working' }] : []),
          ]}
          onSelect={(v) => {
            if (v === 'share') void Share.share({ message: `Join “${cm.name}” (${cm.course.shortName}) on Duely: ${cm.inviteUrl}` });
            else if (v === 'copy') void Clipboard.setStringAsync(cm.inviteUrl).then(() => Alert.alert('Copied'));
            else
              void api<Community>(`/communities/${id}/invite/reset`, { method: 'POST' })
                .then(() => com.refetch())
                .catch((e: Error) => Alert.alert('Couldn’t reset', e.message));
          }}
        />
      </Sheet>

      <Sheet visible={sheet === 'post'} onClose={() => setSheet(null)} title="Share with the community">
        <Segmented
          options={[
            { value: 'assignment', label: 'Task' },
            { value: 'lecture', label: 'Notes' },
            { value: 'session', label: 'Study' },
            { value: 'exam', label: 'Exam' },
            { value: 'resource', label: 'Link' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <Gap h={16} />
        {kind === 'resource' ? (
          <View style={{ gap: 10 }}>
            <Input placeholder="Title (e.g. 2024 past paper)" value={res.title} onChangeText={(t) => setRes({ ...res, title: t })} accessibilityLabel="Resource title" />
            <Input placeholder="Link (optional)" value={res.url} onChangeText={(t) => setRes({ ...res, url: t })} autoCapitalize="none" keyboardType="url" accessibilityLabel="Resource link" />
            <Input placeholder="Note (optional)" value={res.note} onChangeText={(t) => setRes({ ...res, note: t })} accessibilityLabel="Resource note" />
            <PillButton
              title="Post"
              loading={post.isPending}
              disabled={!res.title.trim()}
              onPress={() => post.mutate({ kind: 'resource', title: res.title.trim(), url: res.url.trim() ? (/^https?:\/\//.test(res.url.trim()) ? res.url.trim() : `https://${res.url.trim()}`) : null, note: res.note.trim() || undefined })}
            />
          </View>
        ) : !myCourse ? (
          <T tone="muted">Add {cm.course.shortName} ({cm.course.code}) to your courses to share from it.</T>
        ) : mine[kind].length ? (
          <OptionList options={mine[kind].slice(0, 30)} onSelect={(v) => post.mutate({ kind, id: v })} />
        ) : (
          <T tone="muted">
            {kind === 'session' ? 'No upcoming study sessions for this course. Plan one from an assignment or exam.' : `No ${KIND_LABEL[kind].toLowerCase()} in ${myCourse.shortName} yet.`}
          </T>
        )}
        {post.isPending && kind !== 'resource' ? (
          <T v="small" tone="muted" style={{ marginTop: 8 }}>
            Posting…
          </T>
        ) : null}
      </Sheet>

      <Sheet visible={sheet === 'members'} onClose={() => setSheet(null)} title="Members">
        {cm.members.map((m) => (
          <View key={m.id} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T v="body">{m.name}</T>
            {m.role === 'owner' ? (
              <T v="small" tone="muted">
                Owner
              </T>
            ) : null}
          </View>
        ))}
      </Sheet>

      <Sheet visible={sheet === 'more'} onClose={() => setSheet(null)}>
        <OptionList
          options={[{ value: 'leave', label: 'Leave community' }, ...(cm.isOwner ? [{ value: 'delete', label: 'Delete community' }] : [])]}
          onSelect={(v) => {
            setSheet(null);
            const leave = v === 'leave';
            Alert.alert(leave ? 'Leave this community?' : 'Delete for everyone?', leave ? 'What you saved stays in your Duely.' : 'Members keep what they saved.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: leave ? 'Leave' : 'Delete',
                style: 'destructive',
                onPress: () =>
                  void api(leave ? `/communities/${id}/leave` : `/communities/${id}`, { method: leave ? 'POST' : 'DELETE' })
                    .then(async () => {
                      await qc.invalidateQueries({ queryKey: ['communities'] });
                      router.back();
                    })
                    .catch((e: Error) => Alert.alert('Couldn’t do that', e.message)),
              },
            ]);
          }}
        />
      </Sheet>
    </Screen>
  );
}
