import * as Notifications from 'expo-notifications';
import { EXAM_TYPE_LABELS, type CommunityPost } from '@duely/shared';
import { api } from './api';
import { courseForCode } from './community';
import { snapshot } from './db/queries';
import { getMeta, setMeta } from './db/repo';
import { saveShared } from './share';
import { useApp } from './store';

const EVERY = 5 * 60_000;
let last = 0;
let running = false;

/**
 * Saves community posts the creator marked "save for members" into my account, for communities
 * where I opted in. Runs on this phone after a sync, writes through the normal sync path, then acks
 * so my other devices don't save them again.
 */
export async function autoSaveCommunityPosts(force = false): Promise<number> {
  if (running || !useApp.getState().online || (!force && Date.now() - last < EVERY)) return 0;
  running = true;
  last = Date.now();
  try {
    const posts = await api<CommunityPost[]>('/communities/auto-saves');
    if (!posts.length) return 0;
    const courses = snapshot().courses;
    const acked: string[] = [];
    const titles: string[] = [];
    for (const p of posts) {
      if (getMeta(`cpost:${p.id}`)) {
        acked.push(p.id); // saved by hand already
        continue;
      }
      const course = courseForCode(p.item.course.code, courses);
      if (!course) continue; // course removed or code changed — try again later
      try {
        saveShared(p.item, course.id, { files: (fid) => `/communities/${p.communityId}/posts/${p.id}/files/${fid}`, metaKey: `cpost:${p.id}` });
        setMeta(`cpostAuto:${p.id}`, '1');
        acked.push(p.id);
        titles.push(`${course.shortName} · ${titleOf(p)}`);
      } catch {
        // skip this one
      }
    }
    if (acked.length) await api('/communities/auto-saves/ack', { body: { ids: acked } });
    if (titles.length) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: titles.length === 1 ? 'Added from your community' : `${titles.length} items added from your communities`,
          body: titles.slice(0, 4).join('\n'),
          data: { url: 'duely://communities' },
        },
        trigger: null,
      }).catch(() => undefined);
    }
    return titles.length;
  } catch {
    return 0;
  } finally {
    running = false;
  }
}

function titleOf(p: CommunityPost): string {
  const it = p.item;
  return it.assignment?.title ?? it.lecture?.title ?? it.session?.title ?? (it.exam ? EXAM_TYPE_LABELS[it.exam.type] : 'Shared item');
}
