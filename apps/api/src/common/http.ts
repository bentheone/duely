import {
  BadRequestException,
  createParamDecorator,
  Injectable,
  Logger,
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type PipeTransform,
} from '@nestjs/common';
import type { Request } from 'express';
import { tap } from 'rxjs';
import type { z } from 'zod';

/** Validates a body/query with a shared zod schema (§12 "ValidationPipe via shared"). */
export class ZodPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}

export const IS_PUBLIC = 'duely:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const ALLOW_PAT = 'duely:allowPat';
/** Route accepts personal API tokens (v2 Mac helper) in addition to JWTs. */
export const AllowPat = () => SetMetadata(ALLOW_PAT, true);

export interface AuthedUser {
  userId: string;
  via: 'jwt' | 'pat';
}
export type AuthedRequest = Request & { user?: AuthedUser };

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthedUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.user!;
});

/** Request logging: method, path, status, duration — never headers/bodies (no tokens in logs). */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly log = new Logger('HTTP');
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<Request>();
    const start = Date.now();
    const path = req.path;
    return next.handle().pipe(
      tap({
        next: () => {
          const res = ctx.switchToHttp().getResponse<{ statusCode: number }>();
          this.log.log(`${req.method} ${path} ${res.statusCode} ${Date.now() - start}ms`);
        },
        error: (e: { status?: number }) =>
          this.log.warn(`${req.method} ${path} ${e?.status ?? 500} ${Date.now() - start}ms`),
      }),
    );
  }
}
