import { Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { type z } from 'zod';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from '@goalbet/shared';
import { ENV, type Env } from '../../config/env.js';
import { clearRefreshCookie, setRefreshCookie, USER_REFRESH_COOKIE } from '../../common/cookies.js';
import { DomainError } from '../../common/errors.js';
import { MailerService } from '../../common/mailer.service.js';
import { ReqMeta, type RequestMeta } from '../../common/request-meta.js';
import { ZBody } from '../../common/zod.js';
import { AuthService } from './auth.service.js';

const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000, blockDuration: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private respond(res: Response, r: Awaited<ReturnType<AuthService['login']>>) {
    setRefreshCookie(res, this.env, USER_REFRESH_COOKIE, r.refresh.token, r.refresh.expiresAt);
    return { accessToken: r.accessToken, user: r.user };
  }

  /** F1.3 Register */
  @Post('register')
  @Throttle(AUTH_LIMIT)
  async register(
    @ZBody(registerSchema) body: z.output<typeof registerSchema>,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.register(body, meta));
  }

  /** F1.2 Login */
  @Post('login')
  @HttpCode(200)
  @Throttle(AUTH_LIMIT)
  async login(
    @ZBody(loginSchema) body: z.output<typeof loginSchema>,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.login(body, meta));
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      return this.respond(res, await this.auth.refresh(req.cookies?.[USER_REFRESH_COOKIE]));
    } catch (e) {
      clearRefreshCookie(res, this.env, USER_REFRESH_COOKIE);
      throw e;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[USER_REFRESH_COOKIE]);
    clearRefreshCookie(res, this.env, USER_REFRESH_COOKIE);
  }

  @Post('forgot-password')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000, blockDuration: 60_000 } })
  async forgot(
    @ZBody(forgotPasswordSchema) body: z.output<typeof forgotPasswordSchema>,
    @Req() req: Request,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.auth.forgotPassword(body.email, String(req.get('accept-language') ?? 'ro').slice(0, 2), meta);
    return { ok: true };
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle(AUTH_LIMIT)
  async reset(@ZBody(resetPasswordSchema) body: z.output<typeof resetPasswordSchema>, @ReqMeta() meta: RequestMeta) {
    await this.auth.resetPassword(body, meta);
    return { ok: true };
  }
}

/** Dev/test only: read the outbound mails (password reset links) — disabled in production. */
@ApiTags('dev')
@Controller('dev')
export class DevMailboxController {
  constructor(
    private readonly mailer: MailerService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('mailbox')
  async mailbox(@Query('to') to?: string) {
    if (!this.env.MOCK_CONTROL_ENABLED || this.env.NODE_ENV === 'production') throw new DomainError('NOT_FOUND');
    return this.mailer.devMailbox(to);
  }
}
