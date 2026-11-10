import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CourseModel, AssignmentModel, SubtaskModel, CounterModel, UserModel, currentRev } from '../db/models';
import { AllowPat, CurrentUser, ZodPipe, type AuthedUser } from '../common/http';
import { formatHHMM } from '@duely/shared';

const SinceQuery = z.object({ since: z.coerce.number().int().nonnegative().default(0) });
const AckBody = z.object({ rev: z.number().int().nonnegative() });

export interface ReminderExportItem {
  id: string;
  parentId: string | null;
  title: string;
  notes: string;
  dueAt: number | null;
  completed: boolean;
  deleted: boolean;
  rev: number;
}

/**
 * §9.4 v2 hook for the Mac Reminders helper: assignments + subtasks of active courses
 * with stable ids, incremental by rev. Accepts personal API tokens.
 */
@Controller('export')
export class ExportController {
  @AllowPat()
  @Get('reminders')
  async reminders(@CurrentUser() u: AuthedUser, @Query(new ZodPipe(SinceQuery)) q: z.infer<typeof SinceQuery>) {
    const userId = u.userId;
    const user = await UserModel.findById(userId).lean();
    const tz = user?.timezone ?? 'Africa/Kigali';
    const courses = await CourseModel.find({ userId }).lean();
    const byId = new Map(courses.map((c) => [String(c._id), c]));
    const assignments = await AssignmentModel.find({ userId, rev: { $gt: q.since } }).lean();
    const subtasks = await SubtaskModel.find({ userId, rev: { $gt: q.since } }).lean();
    const items: ReminderExportItem[] = [];
    for (const a of assignments) {
      const c = byId.get(String(a.courseId));
      const inactive = !c || c.status !== 'active' || !!c.deletedAt;
      items.push({
        id: String(a._id),
        parentId: null,
        title: `${c?.shortName ?? ''} — ${a.title}`,
        notes: a.dueAt ? `Due ${formatHHMM(a.dueAt as number, tz)}\nduely://assignment/${a._id}` : `duely://assignment/${a._id}`,
        dueAt: (a.dueAt as number) ?? null,
        completed: ['done', 'submitted', 'graded'].includes(String(a.status)),
        deleted: !!a.deletedAt || inactive,
        rev: a.rev as number,
      });
    }
    for (const s of subtasks) {
      items.push({
        id: String(s._id),
        parentId: String(s.assignmentId),
        title: String(s.title),
        notes: '',
        dueAt: (s.dueAt as number) ?? null,
        completed: !!s.done,
        deleted: !!s.deletedAt,
        rev: s.rev as number,
      });
    }
    items.sort((a, b) => a.rev - b.rev);
    const counter = await CounterModel.findById(userId).lean();
    return { items, maxRev: await currentRev(userId), ackedRev: counter?.exportAckedRev ?? 0 };
  }

  @AllowPat()
  @Post('reminders/ack')
  @HttpCode(200)
  async ack(@CurrentUser() u: AuthedUser, @Body(new ZodPipe(AckBody)) b: z.infer<typeof AckBody>) {
    await CounterModel.updateOne({ _id: u.userId }, { $max: { exportAckedRev: b.rev } }, { upsert: true });
    return { ok: true };
  }
}
