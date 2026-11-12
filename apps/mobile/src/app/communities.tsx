import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Link, Plus } from 'lucide-react-native';
import type { Community } from '@duely/shared';
import { CourseLabel, Empty, Gap, Input, OptionList, PillButton, Screen, Sheet, SmallButton, T } from '@/components/ui';
import { useCommunities } from '@/features/ShareSheet';
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
    <Screen
      back
      onRefresh={() => q.refetch()}
      right={
        <SmallButton title="Join" onPress={() => setSheet('join')} />
      }
    >
      <T v="display">Communities</T>
      <Gap h={8} />
      <T tone="muted">Share assignments, lecture notes, study sessions and resources with classmates.</T>
      <Gap h={24} />
      {!online ? <T tone="muted">You’re offline.</T> : null}
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
