import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_PAT, IS_PUBLIC, type AuthedRequest } from '../common/http';
import { TokensService } from './tokens.service';

/** Global guard: Bearer JWT (or PAT on @AllowPat routes). userId always comes from the token. */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const h = req.headers.authorization ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(h);
    if (!m) throw new UnauthorizedException();
    const token = m[1]!.trim();
    if (token.startsWith('duely_pat_')) {
      if (!this.reflector.getAllAndOverride<boolean>(ALLOW_PAT, targets)) throw new UnauthorizedException();
      req.user = { userId: await this.tokens.verifyPat(token), via: 'pat' };
    } else {
      req.user = { userId: this.tokens.verifyAccess(token), via: 'jwt' };
    }
    return true;
  }
}
