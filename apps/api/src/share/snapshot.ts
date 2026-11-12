import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { LectureBlock, SharedItem } from '@duely/shared';
import { AssignmentModel, CourseModel, ExamModel, FileAttachmentModel, LectureModel, SessionModel, SubtaskModel, UserModel } from '../db/models';
import { cloudinaryCredsFor, cloudinaryDownload } from '../storage/storage.controller';

type Doc = Record<string, unknown>;
export type SnapshotKind = 'assignment' | 'exam' | 'lecture' | 'session';
export type Snapshot = Omit<SharedItem, 'token'>;

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const num = (v: unknown) => (typeof v === 'number' ? v : null);

const courseOf = (c: Doc | null): SharedItem['course'] | null =>
  c ? { code: str(c.code), shortName: str(c.shortName), title: str(c.title), color: str(c.color, '#2563EB') } : null;

/**
 * Snapshot of one of the caller's own items (always scoped by userId) for a friend link or a
 * community post. Copies are made by the receiver's app; nothing here links back to this account.
 */
export async function snapshotItem(userId: string, kind: SnapshotKind, id: string, fallbackCourse?: SharedItem['course']): Promise<Snapshot> {
  const Model = { assignment: AssignmentModel, exam: ExamModel, lecture: LectureModel, session: SessionModel }[kind];
  const item = (await Model.findOne({ _id: id, userId, deletedAt: null }).lean()) as Doc | null;
  if (!item) throw new NotFoundException();

  let courseId = item.courseId as string | undefined;
  if (kind === 'session') {
    const owner = item.assignmentId
      ? ((await AssignmentModel.findOne({ _id: item.assignmentId, userId }).lean()) as Doc | null)
      : item.examId
        ? ((await ExamModel.findOne({ _id: item.examId, userId }).lean()) as Doc | null)
        : null;
    courseId = owner?.courseId as string | undefined;
  }
  const [courseDoc, user, files] = await Promise.all([
    courseId ? (CourseModel.findOne({ _id: courseId, userId }).lean() as Promise<Doc | null>) : Promise.resolve(null),
    UserModel.findById(userId, { name: 1 }).lean(),
    kind === 'session'
      ? Promise.resolve([] as Doc[])
      : (FileAttachmentModel.find({ userId, ownerType: kind, ownerId: id, deletedAt: null, provider: 'cloudinary', remoteId: { $ne: null } }).lean() as Promise<Doc[]>),
  ]);
  const course = courseOf(courseDoc) ?? fallbackCourse;
  if (!course) throw new BadRequestException('Course not found');
  const base = {
    kind,
    from: { name: (user?.name ?? '').split(' ')[0] || 'A friend' },
    createdAt: Date.now(),
    course,
    files: files.map((f) => ({ id: String(f._id), name: str(f.name, 'file'), mime: str(f.mime), size: num(f.size) ?? 0 })),
  };

  if (kind === 'session') {
    return { ...base, session: { title: str(item.title, 'Study'), start: num(item.start) ?? Date.now(), end: num(item.end) ?? Date.now(), kind: item.kind === 'work' ? 'work' : 'study' } };
  }
  if (kind === 'lecture') {
    return {
      ...base,
      lecture: {
        title: str(item.title),
        at: num(item.at) ?? Date.now(),
        topics: Array.isArray(item.topics) ? (item.topics as string[]) : [],
        blocks: Array.isArray(item.blocks) ? (item.blocks as LectureBlock[]) : [],
      },
    };
  }
  if (kind === 'exam') {
    const topics = Array.isArray(item.topics) ? (item.topics as { title?: unknown }[]) : [];
    return {
      ...base,
      exam: {
        type: str(item.type, 'other') as NonNullable<SharedItem['exam']>['type'],
        startsAt: num(item.startsAt) ?? Date.now(),
        durationMin: num(item.durationMin),
        room: str(item.room) || null,
        topics: topics.map((x) => ({ title: str(x.title) })).filter((x) => x.title),
        notes: str(item.notes),
      },
    };
  }
  const subtasks = (await SubtaskModel.find({ userId, assignmentId: id, deletedAt: null }).sort({ order: 1 }).lean()) as Doc[];
  const group = (item.group as NonNullable<SharedItem['assignment']>['group']) ?? null;
  return {
    ...base,
    assignment: {
      title: str(item.title, 'Assignment'),
      notes: str(item.notes),
      links: Array.isArray(item.links) ? (item.links as { title: string; url: string }[]) : [],
      dueAt: num(item.dueAt),
      kind: item.kind === 'group' ? 'group' : 'individual',
      submission: str(item.submission, 'moodle') as NonNullable<SharedItem['assignment']>['submission'],
      marks: num(item.marks),
      group: group
        ? {
            members: (group.members ?? []).map((m) => ({ name: m.isMe ? user?.name || m.name : m.name, phone: m.phone ?? null, whatsapp: m.whatsapp ?? null, isMe: false })),
            myPart: null, // the sender's own part stays theirs
            meetings: group.meetings ?? [],
            chatLink: group.chatLink ?? null,
          }
        : null,
      subtasks: subtasks.map((s) => ({ title: str(s.title), dueAt: num(s.dueAt), order: num(s.order) ?? 0 })),
    },
  };
}

/** Signed download (1 h) for an attachment of a shared snapshot, using the sharer's Cloudinary. */
export async function sharedFileDownload(ownerUserId: string, fileId: string) {
  const f = await FileAttachmentModel.findOne({ _id: fileId, userId: ownerUserId, deletedAt: null }).lean();
  if (!f || !f.remoteId || f.provider !== 'cloudinary') throw new NotFoundException('File not available');
  const c = await cloudinaryCredsFor(ownerUserId);
  if (!c) throw new NotFoundException('File not available');
  return cloudinaryDownload(c, String(f.remoteId), String(f.mime), (f.remoteUrl as string | null | undefined) ?? null);
}
