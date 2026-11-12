import * as FS from 'expo-file-system/legacy';
import { Share } from 'react-native';
import type { Course, SharedItem, ShareKind } from '@duely/shared';
import { api } from './api';
import { addLocalFile, type FileOwnerType } from './files';
import { getMetaJson, newId, save, setMetaJson } from './db/repo';
import { useApp } from './store';
import { pendingCount, syncNow } from './sync/engine';
import { addManualSession, createAssignment, createExam, createLecture, upsertCourse } from '@/features/actions';

/** Creates (or refreshes) the share link on the server and opens the system share sheet. */
export async function shareItem(kind: 'assignment' | 'exam' | 'lecture', id: string, title: string): Promise<void> {
  if (!useApp.getState().online) throw new Error('Connect to the internet to share.');
  // The server snapshots its own copy, so send local edits first.
  if (pendingCount() > 0) await syncNow();
  const { url } = await api<{ token: string; url: string }>('/shares', { body: { kind, id } });
  await Share.share({ message: `${title}\nOpen in Duely: ${url}` });
}

export function savedShare(token: string): { kind: ShareKind; id: string } | null {
  return getMetaJson<{ kind: ShareKind; id: string } | null>(`share:${token}`, null);
}

/** Best match among my active courses: same code, else same short name. */
export function matchCourse(item: SharedItem, courses: Course[]): Course | null {
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const code = norm(item.course.code);
  return (
    (code ? courses.find((c) => norm(c.code) === code) : undefined) ??
    courses.find((c) => norm(c.shortName) === norm(item.course.shortName)) ??
    null
  );
}

/** Where a shared item's attachments are fetched from (friend link or community post). */
export type FileSource = (fileId: string) => string;
export const shareFiles = (token: string): FileSource => (fileId) => `/shares/${token}/files/${fileId}`;

/**
 * Copies a shared item into my own data (local write → /sync, the one write path). `courseId` null =
 * create the sender's course for me. Attachments download + re-upload to my storage in the background.
 * `metaKey` remembers the copy so the same link/post opens it instead of saving twice.
 */
export function saveShared(
  item: SharedItem,
  courseId: string | null,
  opts: { files?: FileSource; metaKey?: string } = {},
): { kind: ShareKind; id: string } {
  const course = courseId ?? upsertCourse({ shortName: item.course.shortName.slice(0, 24) || 'Course', code: item.course.code, title: item.course.title, color: item.course.color }).id;
  // New ids for copied attachments, decided up front so lecture blocks can point at them.
  const fileIds = new Map(item.files.map((f) => [f.id, newId()]));
  let saved: { kind: ShareKind; id: string };

  if (item.kind === 'exam' && item.exam) {
    const e = item.exam;
    const exam = createExam({
      courseId: course,
      type: e.type,
      startsAt: e.startsAt,
      durationMin: e.durationMin,
      room: e.room,
      notes: e.notes,
      topics: e.topics.map((t) => ({ id: newId(), title: t.title, done: false })),
    });
    saved = { kind: 'exam', id: exam.id };
  } else if (item.kind === 'lecture' && item.lecture) {
    const l = item.lecture;
    const lec = createLecture({
      courseId: course,
      at: l.at,
      title: l.title,
      topics: l.topics,
      blocks: l.blocks.map((b) => ({ ...b, id: newId(), done: b.type === 'check' || b.type === 'research' ? false : b.done, fileId: b.fileId ? (fileIds.get(b.fileId) ?? null) : null })),
    });
    saved = { kind: 'lecture', id: lec.id };
  } else if (item.kind === 'session' && item.session) {
    const se = item.session;
    const prefix = `${item.course.shortName} · `;
    const s = addManualSession({ title: se.title.startsWith(prefix) ? se.title : `${prefix}${se.title}`, start: se.start, minutes: Math.max(15, Math.round((se.end - se.start) / 60_000)) });
    saved = { kind: 'session', id: s.id };
  } else if (item.assignment) {
    const a = item.assignment;
    const me = (useApp.getState().user?.name ?? '').trim().toLowerCase();
    const myFirst = me.split(' ')[0];
    const group = a.group
      ? {
          ...a.group,
          // Mark me if the sender listed me; otherwise add me so the group stays "mine" too.
          members: (() => {
            const ms = a.group.members.map((m) => ({ ...m, isMe: !!me && (m.name.trim().toLowerCase() === me || m.name.trim().toLowerCase() === myFirst) }));
            return ms.some((m) => m.isMe) ? ms : [...ms, { name: useApp.getState().user?.name ?? 'Me', isMe: true }];
          })(),
        }
      : null;
    const asg = createAssignment({
      courseId: course,
      title: a.title,
      notes: a.notes,
      links: a.links,
      dueAt: a.dueAt,
      kind: a.kind,
      submission: a.submission,
      marks: a.marks,
      group,
    });
    a.subtasks.forEach((st, i) => save('subtasks', { assignmentId: asg.id, title: st.title, dueAt: st.dueAt, done: false, order: st.order || i + 1, googleTaskId: null }));
    saved = { kind: 'assignment', id: asg.id };
  } else {
    throw new Error('Nothing to save here.');
  }

  setMetaJson(opts.metaKey ?? `share:${item.token}`, saved);
  if (saved.kind !== 'session') void copyFiles(item, saved, fileIds, opts.files ?? shareFiles(item.token)).catch(() => undefined);
  return saved;
}

async function copyFiles(item: SharedItem, owner: { kind: ShareKind; id: string }, ids: Map<string, string>, source: FileSource): Promise<void> {
  for (const f of item.files) {
    try {
      const target = await api<{ url: string; headers: Record<string, string>; fallbackUrl?: string | null }>(source(f.id));
      const tmp = `${FS.cacheDirectory}share-${newId()}`;
      let ok = false;
      for (const url of [target.url, target.fallbackUrl].filter((u): u is string => !!u)) {
        const r = await FS.downloadAsync(url, tmp, { headers: url === target.url ? target.headers : {} });
        if (r.status < 300) {
          ok = true;
          break;
        }
      }
      if (ok) await addLocalFile({ type: owner.kind as FileOwnerType, id: owner.id }, { uri: tmp, name: f.name, mime: f.mime, size: f.size }, ids.get(f.id));
      await FS.deleteAsync(tmp, { idempotent: true });
    } catch {
      // One missing file shouldn't stop the rest.
    }
  }
}
