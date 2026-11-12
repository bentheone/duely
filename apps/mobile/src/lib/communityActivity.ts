import * as Notifications from 'expo-notifications';
import { EXAM_TYPE_LABELS, type CommunityActivity, type SharedItem } from '@duely/shared';
import { api } from './api';
import { getMeta, setMeta } from './db/repo';
import { CHANNEL_COMMUNITY } from './notifications';
import { queryClient } from './queryClient';
import { currentSettings, useApp } from './store';

const EVERY = 2 * 60_000;
let last = 0;
let running = false;

const label = (it: SharedItem) =>
  it.assignment?.title ?? (it.exam ? EXAM_TYPE_LABELS[it.exam.type] : null) ?? it.lecture?.title ?? it.lecture?.topics[0] ?? it.session?.title ?? it.resource?.title ?? 'something new';
const KIND: Record<SharedItem['kind'], string> = { assignment: 'an assignment', exam: 'an exam', lecture: 'lecture notes', session: 'a study session', resource: 'a link' };

/**
 * New posts by others in my communities → local notifications (the app checks after syncs and in
 * the background; no push service needed). Also refreshes the unread badge.
 */
export async function checkCommunityActivity(force = false): Promise<void> {
  if (running || !useApp.getState().online || (!force && Date.now() - last < EVERY)) return;
  running = true;
  last = Date.now();
  try {
    const since = getMeta('communityActivitySince');
    const res = await api<CommunityActivity>(`/communities/activity${since ? `?since=${since}` : ''}`);
    setMeta('communityActivitySince', String(res.now));
    if (!since || !res.posts.length) return; // first run just sets the cursor
    void queryClient.invalidateQueries({ queryKey: ['communities'] });
    if (!(currentSettings().communities ?? { notify: true }).notify) return;
    // Auto-saved posts get their own "added to your Duely" notification.
    const posts = res.posts.filter((p) => !p.autoSavedForMe);
    const show = posts.length > 3 ? [] : posts;
    for (const p of show) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${p.communityName}`,
          body: `${p.author.name.split(' ')[0]} shared ${KIND[p.item.kind]}: ${label(p.item)}`,
          data: { url: `duely://community/${p.communityId}` },
        },
        trigger: { channelId: CHANNEL_COMMUNITY } as Notifications.NotificationTriggerInput,
      }).catch(() => undefined);
    }
    if (posts.length > 3) {
      const names = [...new Set(posts.map((p) => p.communityName))];
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${posts.length} new posts in your communities`,
          body: names.slice(0, 3).join(', '),
          data: { url: names.length === 1 ? `duely://community/${posts[0]!.communityId}` : 'duely://communities' },
        },
        trigger: { channelId: CHANNEL_COMMUNITY } as Notifications.NotificationTriggerInput,
      }).catch(() => undefined);
    }
  } catch {
    // offline / signed out — try next time
  } finally {
    running = false;
  }
}
