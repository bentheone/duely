import React, { useState } from 'react';
import { Alert, Switch } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Community, CommunityInvite } from '@duely/shared';
import { CourseLabel, FieldRow, Gap, OptionList, PillButton, Screen, T } from '@/components/ui';
import { autoSaveCommunityPosts } from '@/lib/communityAutoSave';
import { useTheme } from '@/lib/theme';
import { upsertCourse } from '@/features/actions';
import { api, ApiError } from '@/lib/api';
import { courseForCode } from '@/lib/community';
import { useAllCourses, useCourses } from '@/lib/db/queries';
import { save } from '@/lib/db/repo';
import { useApp } from '@/lib/store';

const ADD = '__add__';

/**
 * Joining a course community. You need the community's course on your account first: either add it
 * (same code, name and colour), or pick one of your courses and let its code change to match.
 */
export default function JoinCommunity() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const signedIn = useApp((s) => s.signedIn);
  const onboarded = useApp((s) => s.onboarded);
  const all = useAllCourses();
  const { active } = useCourses();
  const qc = useQueryClient();
  const [choice, setChoice] = useState<string>(ADD);
  const [busy, setBusy] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const { c } = useTheme();

  const q = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<CommunityInvite>(`/communities/invite/${token}`),
    enabled: !!token && signedIn,
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  const inv = q.data;
  const matched = inv ? courseForCode(inv.course.code, all) : null;

  async function join() {
    if (!inv) return;
    setBusy(true);
    try {
      const com = await api<Community>('/communities/join', { body: { token, autoSave } });
      await qc.invalidateQueries({ queryKey: ['communities'] });
      if (autoSave) void autoSaveCommunityPosts(true);
      router.replace(`/community/${com.id}`);
    } catch (e) {
      Alert.alert('Couldn’t join', e instanceof ApiError ? e.message : 'Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  function prepareCourseThenJoin() {
    if (!inv) return;
    if (matched) return void join();
    if (choice === ADD) {
      upsertCourse({ shortName: inv.course.shortName, code: inv.course.code, title: inv.course.title || inv.course.shortName, color: inv.course.color });
      return void join();
    }
    const mine = active.find((x) => x.id === choice);
    if (!mine) return;
    Alert.alert(
      `Change ${mine.shortName}’s code?`,
      `${mine.code ? `${mine.code} → ` : ''}${inv.course.code}. Everything in ${mine.shortName} stays; only the code changes so it matches the community.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change and join',
          onPress: () => {
            save('courses', { id: mine.id, code: inv.course.code });
            void join();
          },
        },
      ],
    );
  }

  if (!signedIn || !onboarded) {
    return (
      <Screen back footer={<PillButton title="Sign in" onPress={() => router.replace('/')} />}>
        <T v="display">Community invite</T>
        <Gap h={12} />
        <T tone="muted">Sign in to Duely first, then open the invite again.</T>
      </Screen>
    );
  }
  if (q.isLoading) {
    return (
      <Screen back>
        <T tone="muted">Opening invite…</T>
      </Screen>
    );
  }
  if (!inv) {
    const gone = q.error instanceof ApiError && q.error.status === 404;
    return (
      <Screen back footer={gone ? undefined : <PillButton title="Try again" onPress={() => void q.refetch()} />}>
        <T v="display">Can’t open</T>
        <Gap h={12} />
        <T tone="muted">{gone ? 'This invite expired or was reset. Ask for a new one.' : 'Check your connection.'}</T>
      </Screen>
    );
  }
  if (inv.alreadyMember) {
    return (
      <Screen back footer={<PillButton title="Open" onPress={() => router.replace(`/community/${inv.communityId}`)} />}>
        <T v="display">{inv.name}</T>
        <Gap h={12} />
        <T tone="muted">You’re already a member.</T>
      </Screen>
    );
  }

  return (
    <Screen back footer={<PillButton title={matched ? 'Join' : choice === ADD ? `Add ${inv.course.shortName} and join` : 'Use this course and join'} loading={busy} onPress={prepareCourseThenJoin} />}>
      <T v="small" tone="muted">
        {inv.ownerName} invited you · {inv.memberCount} {inv.memberCount === 1 ? 'member' : 'members'}
      </T>
      <Gap h={8} />
      <T v="display">{inv.name}</T>
      <Gap h={10} />
      <CourseLabel color={inv.course.color} name={inv.course.shortName} suffix={inv.course.code} />
      <Gap h={20} />
      <FieldRow
        label={`Auto-save ${inv.ownerName}’s posts`}
        right={<Switch value={autoSave} onValueChange={setAutoSave} trackColor={{ true: c.text, false: c.surfaceButton }} thumbColor={c.bg} accessibilityLabel="Auto-save the creator's posts" />}
      />
      <T v="small" tone="muted" style={{ marginTop: 6 }}>
        Assignments, quizzes and study sessions the creator marks “save for members” land in your Duely and calendar by themselves. Change it any time.
      </T>
      <Gap h={28} />
      {matched ? (
        <T tone="muted">Shared items will go into your {matched.shortName}.</T>
      ) : (
        <>
          <T v="item">This course isn’t on your account yet</T>
          <Gap h={4} />
          <T tone="muted">Add it, or pick the course you already have — its code becomes {inv.course.code}.</T>
          <Gap h={12} />
          <OptionList
            options={[
              { value: ADD, label: `Add ${inv.course.shortName} (${inv.course.code})`, color: inv.course.color },
              ...active.map((x) => ({ value: x.id, label: `Use my ${x.shortName}`, color: x.color, hint: x.code ? `${x.code} → ${inv.course.code}` : `Code becomes ${inv.course.code}` })),
            ]}
            value={choice}
            onSelect={setChoice}
          />
        </>
      )}
    </Screen>
  );
}
