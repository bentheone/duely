import { BadRequestException, Body, Controller, HttpCode, NotFoundException, Post } from '@nestjs/common';
import type { z } from 'zod';
import {
  DAY,
  MINUTE,
  PlannerRequestSchema,
  findFreeSlots,
  uuidv7,
  type Interval,
  type Session,
} from '@duely/shared';
import { CurrentUser, ZodPipe, type AuthedUser } from '../common/http';
import { AssignmentModel, ClassSessionModel, ExamModel, SessionModel, UserModel } from '../db/models';
import { GoogleSyncService } from '../google/google-sync.service';

type Body_ = z.infer<typeof PlannerRequestSchema>;

/** §7.2 free-slot planner. Suggestions are returned, not stored — the device saves what the user accepts. */
@Controller('planner')
export class PlannerController {
  constructor(private readonly google: GoogleSyncService) {}

  @Post('suggest')
  @HttpCode(200)
  async suggest(@CurrentUser() u: AuthedUser, @Body(new ZodPipe(PlannerRequestSchema)) b: Body_) {
    const userId = u.userId;
    const user = await UserModel.findById(userId).lean();
    if (!user) throw new NotFoundException();
    const tz = user.timezone;
    const now = Date.now();

    let deadline: number;
    let title: string;
    let kind: Session['kind'];
    if (b.assignmentId) {
      const a = await AssignmentModel.findOne({ _id: b.assignmentId, userId, deletedAt: null }).lean();
      if (!a) throw new NotFoundException('Assignment not found');
      if (!a.dueAt) throw new BadRequestException('Assignment has no due date');
      deadline = a.dueAt as number;
      title = String(a.title);
      kind = 'work';
    } else {
      const e = await ExamModel.findOne({ _id: b.examId, userId, deletedAt: null }).lean();
      if (!e) throw new NotFoundException('Exam not found');
      deadline = e.startsAt as number;
      title = 'Study';
      kind = 'study';
    }
    const before = Math.min(b.before ?? deadline, deadline);
    const from = Math.ceil((now + 15 * MINUTE) / (15 * MINUTE)) * (15 * MINUTE);
    if (before <= from) return { suggestions: [], freeSlotsBefore: before };

    // Busy = Google freebusy (timetable + busy + Duely) ∪ cached classes ∪ local confirmed sessions.
    const busy: Interval[] = [];
    const acc = await this.google.account(userId);
    if (acc?.refreshTokenEnc) {
      const cals = [...new Set([...acc.timetableCalendarIds, ...acc.busyCalendarIds, ...(acc.duelyCalendarId ? [acc.duelyCalendarId] : [])])];
      try {
        busy.push(...(await this.google.api(acc).freeBusy(cals, from, before, tz)));
      } catch {
        // offline from Google → fall back to local knowledge only
      }
    }
    const classes = await ClassSessionModel.find({ userId, deletedAt: null, end: { $gt: from }, start: { $lt: before } }).lean();
    busy.push(...classes.map((c) => ({ start: c.start as number, end: c.end as number })));
    const sessions = await SessionModel.find({
      userId,
      deletedAt: null,
      status: 'confirmed',
      end: { $gt: from },
      start: { $lt: before + DAY },
    }).lean();
    busy.push(...sessions.map((s) => ({ start: s.start as number, end: s.end as number })));

    const slots = findFreeSlots({
      busy,
      from,
      before,
      tz,
      workHours: user.settings.workHours,
      totalMinutes: b.totalMinutes,
      preferredMinutes: user.settings.sessionDefaultMinutes,
    });
    const suggestions: Omit<Session, 'userId' | 'rev'>[] = slots.map((s) => ({
      id: uuidv7(),
      kind,
      assignmentId: b.assignmentId ?? null,
      examId: b.examId ?? null,
      title,
      start: s.start,
      end: s.end,
      status: 'suggested',
      googleEventId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));
    return { suggestions, busy: busy.filter((x) => x.end > from && x.start < before) };
  }
}
