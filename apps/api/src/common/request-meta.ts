import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export function requestMeta(req: Request): RequestMeta {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}

/** Client IP + user agent for audit records. */
export const ReqMeta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta =>
  requestMeta(ctx.switchToHttp().getRequest<Request>()),
);
