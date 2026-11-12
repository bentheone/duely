import React, { useState } from 'react';
import { Alert } from 'react-native';
import { OptionList, Sheet, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { shareItem } from '@/lib/share';
import { pendingCount, syncNow } from '@/lib/sync/engine';
import { useApp } from '@/lib/store';
import { useCommunities } from '@/lib/communityQueries';

export { useCommunities };

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/**
 * "Share" for an assignment / exam / lecture / study session: a private link to one friend, or a post
 * to any of my communities for the same course code.
 */
export function ShareSheet({
  visible,
  onClose,
  kind,
  id,
  title,
  courseCode,
}: {
  visible: boolean;
  onClose: () => void;
  kind: 'assignment' | 'exam' | 'lecture' | 'session';
  id: string;
  title: string;
  courseCode: string | null | undefined;
}) {
  const online = useApp((s) => s.online);
  const communities = useCommunities(visible);
  const [busy, setBusy] = useState<string | null>(null);
  const matching = (communities.data ?? []).filter((c) => !!courseCode && norm(c.course.code) === norm(courseCode));

  async function run(value: string) {
    if (!online) {
      Alert.alert('You’re offline', 'Connect to the internet to share.');
      return;
    }
    setBusy(value);
    try {
      if (value === 'friend') {
        if (kind === 'session') throw new Error('Share study sessions in a course community.');
        await shareItem(kind, id, title);
      } else {
        if (pendingCount() > 0) await syncNow();
        await api(`/communities/${value}/posts`, { body: { kind, id } });
        Alert.alert('Posted', 'Members can save it to their Duely.');
      }
      onClose();
    } catch (e) {
      Alert.alert('Couldn’t share', e instanceof ApiError && e.status === 404 ? 'It hasn’t synced yet. Try again in a moment.' : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Share">
      <OptionList
        options={[
          ...(kind !== 'session' ? [{ value: 'friend', label: 'Send to a friend', hint: busy === 'friend' ? 'Creating link…' : 'Private link that opens in Duely' }] : []),
          ...matching.map((c) => ({ value: c.id, label: `Post to ${c.name}`, hint: busy === c.id ? 'Posting…' : `${c.members.length} ${c.members.length === 1 ? 'member' : 'members'}` })),
        ]}
        onSelect={(v) => void run(v)}
      />
      {!matching.length ? (
        <T v="small" tone="muted" style={{ marginTop: 12 }}>
          {communities.isLoading ? 'Looking for your communities…' : 'Join or create a community for this course (Courses → Communities) to post here.'}
        </T>
      ) : null}
    </Sheet>
  );
}
