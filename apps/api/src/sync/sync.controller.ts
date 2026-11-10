import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PushBodySchema } from '@duely/shared';
import { CurrentUser, ZodPipe, type AuthedUser } from '../common/http';
import { SyncService } from './sync.service';

const PullQuery = z.object({ since: z.coerce.number().int().nonnegative().default(0) });

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  @HttpCode(200)
  push(@CurrentUser() u: AuthedUser, @Body(new ZodPipe(PushBodySchema)) body: z.infer<typeof PushBodySchema>) {
    return this.sync.push(u.userId, body.changes);
  }

  @Get('pull')
  pull(@CurrentUser() u: AuthedUser, @Query(new ZodPipe(PullQuery)) q: z.infer<typeof PullQuery>) {
    return this.sync.pull(u.userId, q.since);
  }
}
