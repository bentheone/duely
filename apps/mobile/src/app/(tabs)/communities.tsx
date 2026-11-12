import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { ChevronRight, Link, Plus } from 'lucide-react-native';
import type { Colleague, Community } from '@duely/shared';
import { CourseLabel, Empty, Gap, Input, OptionList, PillButton, Screen, Sheet, SmallButton, T } from '@/components/ui';
import { useCommunities } from '@/lib/communityQueries';
import { TitleRow } from '@/components/ProfileButton';
import { HeaderSwitch } from '@/components/HeaderSwitch';
import { CountBadge } from '@/components/CountBadge';
import { api, ApiError } from '@/lib/api';
import { useCourses } from '@/lib/db/queries';
import { save } from '@/lib/db/repo';
import { useApp } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { inviteToken } from '@/lib/community';

/** Course communities I'm in; create one for a course or join with a link. */
export default function Communities() {
  const { c } = useTheme();
  const online = useApp((s) => s.online);
  const q = useCommunities();
  const qc = useQueryClient();
  const { active } = useCourses();
  const [sheet, setSheet] = useState<null | 'create' | 'join'>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'communities' | 'colleagues'>('communities');
  const colleagues = useQuery({ queryKey: ['colleagues'], queryFn: () => api<Colleague[]>('/colleagues'), enabled: online && tab === 'colleagues' });

  const course = active.find((x) => x.id === courseId) ?? null;

  async function create() {
    if (!course) return;
    const finalCode = (course.code || code).trim();
    if (finalCode.length < 2) return;
    setBusy(true);
    try {
      // Communities match members' courses by code, so the course needs one.
      if (!course.code) save('courses', { id: course.id, code: finalCode });
      const com = await api<Community>('/communities', {
        body: { name: name.trim() || course.shortName, course: { code: finalCode, shortName: course.shortName, title: course.title || course.shortName, color: course.color } },
      });
      await qc.invalidateQueries({ queryKey: ['communities'] });
      setSheet(null);
      router.push(`/community/${com.id}`);
    } catch (e) {
      Alert.alert('Couldn’t create it', e instanceof ApiError ? e.message : 'Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen onRefresh={() => Promise.all([q.refetch(), colleagues.refetch()])}>
      <TitleRow>
        <HeaderSwitch
          options={[
            { value: 'communities', label: 'Communities' },
            { value: 'colleagues', label: 'Colleagues' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </TitleRow>
      <Gap h={20} />
      {!online ? <T tone="muted">You’re offline.</T> : null}
      {tab === 'colleagues' ? (
        <Colleagues q={colleagues} />
      ) : (
      <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <T tone="muted" style={{ flex: 1 }}>
          Share assignments, notes, study sessions and resources with classmates.
        </T>
        <SmallButton title="Join" onPress={() => setSheet('join')} />
      </View>
      <Gap h={16} />
      {q.isLoading ? <T tone="muted">Loading…</T> : null}
      {q.data && !q.data.length ? <Empty title="None yet" hint="Create one for a course and invite classmates with a QR code or link." /> : null}
      {(q.data ?? []).map((com) => (
        <Pressable key={com.id} accessibilityRole="button" onPress={() => router.push(`/community/${com.id}`)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 68, gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <T v="item" numberOfLines={1}>
              {com.name}
            </T>
            <CourseLabel color={com.course.color} name={com.course.shortName} suffix={`${com.course.code} · ${com.members.length} ${com.members.length === 1 ? 'member' : 'members'}`} />
          </View>
          {com.unread ? <CountBadge n={com.unread} /> : null}
          <ChevronRight size={18} color={c.muted} />
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setCourseId(active[0]?.id ?? null);
          setName('');
          setCode('');
          setSheet('create');
        }}
        style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <Plus size={18} color={c.muted} />
        <T tone="muted">Create a community</T>
      </Pressable>
      </>
      )}

      <Sheet visible={sheet === 'create'} onClose={() => setSheet(null)} title="New community">
        <T v="small" tone="muted">
          For which course?
        </T>
        <OptionList options={active.map((x) => ({ value: x.id, label: x.shortName, color: x.color, hint: x.code || 'No code yet' }))} value={courseId} onSelect={setCourseId} />
        {course && !course.code ? (
          <Input placeholder="Course code (e.g. INSY 8311)" value={code} onChangeText={setCode} autoCapitalize="characters" accessibilityLabel="Course code" />
        ) : null}
        <Gap h={10} />
        <Input placeholder={course ? `Name (e.g. ${course.shortName} study group)` : 'Name'} value={name} onChangeText={setName} maxLength={80} accessibilityLabel="Community name" />
        <Gap h={16} />
        <PillButton title="Create" loading={busy} disabled={!course || !online || (course.code || code).trim().length < 2} onPress={() => void create()} />
      </Sheet>

      <Sheet visible={sheet === 'join'} onClose={() => setSheet(null)} title="Join a community">
        <T tone="muted">Scan the QR code with your camera, or paste the invite link here.</T>
        <Gap h={12} />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Link size={18} color={c.muted} />
          <Input style={{ flex: 1 }} placeholder="https://…/c/…" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Invite link" />
        </View>
        <Gap h={16} />
        <PillButton
          title="Open invite"
          disabled={!inviteToken(link)}
          onPress={() => {
            const t = inviteToken(link);
            if (!t) return;
            setSheet(null);
            setLink('');
            router.push(`/community/join/${t}`);
          }}
        />
      </Sheet>
    </Screen>
  );
}

/** People I'm connected with through communities (I joined theirs or they joined mine). */
function Colleagues({ q }: { q: UseQueryResult<Colleague[]> }) {
  const { c } = useTheme();
  const [open, setOpen] = useState<Colleague | null>(null);
  if (q.isLoading) return <T tone="muted">Loading…</T>;
  if (q.error) return <T tone="danger">{(q.error as Error).message}</T>;
  if (!q.data?.length) return <Empty title="No colleagues yet" hint="Join a classmate’s community or invite them to yours." />;
  return (
    <View>
      {q.data.map((p) => (
        <Pressable key={p.id} accessibilityRole="button" onPress={() => setOpen(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surfaceButton, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {p.avatarUrl ? <Image source={{ uri: p.avatarUrl }} style={{ width: 44, height: 44 }} /> : <T v="item">{p.name.slice(0, 1)}</T>}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="item" numberOfLines={1}>
              {p.name}
            </T>
            <T v="meta" tone="muted" numberOfLines={1}>
              {[p.username ? `@${p.username}` : null, p.communities.map((x) => x.course.shortName).filter((v, i, a) => a.indexOf(v) === i).join(', ')].filter(Boolean).join(' · ')}
            </T>
          </View>
        </Pressable>
      ))}
      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.name}>
        {open?.username ? (
          <T tone="muted" style={{ marginBottom: 12 }}>
            @{open.username}
          </T>
        ) : null}
        <T v="small" tone="muted">
          Communities you share
        </T>
        <OptionList
          options={(open?.communities ?? []).map((x) => ({ value: x.id, label: x.name, color: x.course.color, hint: x.course.code }))}
          onSelect={(id) => {
            setOpen(null);
            router.push(`/community/${id}`);
          }}
        />
      </Sheet>
    </View>
  );
}
