import { Controller, Get, HttpCode, Inject, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { adminLoginSchema, localeSchema } from '@goalbet/shared';
import { ENV, type Env } from '../../config/env.js';
import { AdminAuthGuard, type AuthedAdmin, CurrentAdmin } from '../../common/auth/guards.js';
import { TokensService } from '../../common/auth/tokens.service.js';
import { ADMIN_REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie } from '../../common/cookies.js';
import { ReqMeta, type RequestMeta } from '../../common/request-meta.js';
import { ZBody } from '../../common/zod.js';
import { type AdminLoginResult, AdminAuthService } from './admin-auth.service.js';

const totpEnableSchema = z.object({
  setupToken: z.string().min(10),
  totp: z.string().regex(/^\d{6}$/, { message: 'validation.totp' }),
});

const LIMIT = { default: { limit: 10, ttl: 60_000, blockDuration: 5 * 60_000 } };

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly tokens: TokensService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private respond(res: Response, r: AdminLoginResult) {
    if (r.status !== 'OK') return r;
    setRefreshCookie(res, this.env, ADMIN_REFRESH_COOKIE, r.refresh.token, r.refresh.expiresAt);
    return { status: r.status, accessToken: r.accessToken, admin: r.admin };
  }

  /** Step 1: email + password. Step 2 (same endpoint): + totp. First login returns a TOTP enrolment. */
  @Post('login')
  @HttpCode(200)
  @Throttle(LIMIT)
  async login(
    @ZBody(adminLoginSchema) body: z.output<typeof adminLoginSchema>,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.login(body, meta));
  }

  @Post('totp/enable')
  @HttpCode(200)
  @Throttle(LIMIT)
  async enableTotp(
    @ZBody(totpEnableSchema) body: z.output<typeof totpEnableSchema>,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.enableTotp(body.setupToken, body.totp, meta));
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const r = await this.auth.refresh(req.cookies?.[ADMIN_REFRESH_COOKIE]);
      setRefreshCookie(res, this.env, ADMIN_REFRESH_COOKIE, r.refresh.token, r.refresh.expiresAt);
      return { status: 'OK', accessToken: r.accessToken, admin: r.admin };
    } catch (e) {
      clearRefreshCookie(res, this.env, ADMIN_REFRESH_COOKIE);
      throw e;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    let adminId: string | null = null;
    const h = req.get('authorization');
    if (h?.startsWith('Bearer ')) {
      try {
        adminId = this.tokens.verifyAdmin(h.slice(7)).sub;
      } catch {
        /* expired access token: still log out */
      }
    }
    await this.auth.logout(req.cookies?.[ADMIN_REFRESH_COOKIE], adminId, meta);
    clearRefreshCookie(res, this.env, ADMIN_REFRESH_COOKIE);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  me(@CurrentAdmin() admin: AuthedAdmin) {
    return this.auth.me(admin.id);
  }

  /** F0.3 — admin language remembered per admin user. */
  @Patch('me')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  setLocale(@CurrentAdmin() admin: AuthedAdmin, @ZBody(z.object({ locale: localeSchema })) body: { locale: 'ro' | 'en' }) {
    return this.auth.setLocale(admin.id, body.locale);
  }
}
