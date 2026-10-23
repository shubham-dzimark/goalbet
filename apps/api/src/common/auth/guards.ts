import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type AdminRole } from '@goalbet/shared';
import { ENV, type Env } from '../../config/env.js';
import { DomainError } from '../errors.js';
import { SessionService } from './session.service.js';
import { type AdminTokenPayload, TokensService } from './tokens.service.js';

export interface AuthedUser {
  id: string;
}

export interface AuthedAdmin {
  id: string;
  role: AdminRole;
  email: string;
  sessionId: string;
}

type AuthedRequest = Request & { user?: AuthedUser; admin?: AuthedAdmin };

function bearer(req: Request): string | null {
  const h = req.get('authorization');
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

/** Requires a valid player access token. */
@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokensService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = bearer(req);
    if (!token) throw new DomainError('UNAUTHORIZED');
    try {
      req.user = { id: this.tokens.verifyUser(token).sub };
    } catch {
      throw new DomainError('UNAUTHORIZED');
    }
    return true;
  }
}

/** Attaches the player when a valid token is present but lets guests through. */
@Injectable()
export class OptionalUserAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokensService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = bearer(req);
    if (token) {
      try {
        req.user = { id: this.tokens.verifyUser(token).sub };
      } catch {
        /* guest */
      }
    }
    return true;
  }
}

export const ROLES_KEY = 'gb:roles';
/** Restrict an admin route to roles (SUPER_ADMIN always passes). */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);

/** Requires an admin access token whose session is active and not idle-expired (F3.1). */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = bearer(req);
    if (!token) throw new DomainError('UNAUTHORIZED');
    let payload: AdminTokenPayload;
    try {
      payload = this.tokens.verifyAdmin(token);
    } catch {
      throw new DomainError('UNAUTHORIZED');
    }
    if (!(await this.sessions.touch(payload.sid, this.env.ADMIN_IDLE_TIMEOUT_MIN * 60_000))) {
      throw new DomainError('SESSION_EXPIRED');
    }
    req.admin = { id: payload.sub, role: payload.role, email: payload.email, sessionId: payload.sid };

    const roles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles && roles.length > 0 && payload.role !== 'SUPER_ADMIN' && !roles.includes(payload.role)) {
      throw new DomainError('FORBIDDEN');
    }
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthedUser | undefined => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});

export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthedAdmin => {
  const admin = ctx.switchToHttp().getRequest<AuthedRequest>().admin;
  if (!admin) throw new DomainError('UNAUTHORIZED');
  return admin;
});
