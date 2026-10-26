import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import {
  adminAccountUpdateSchema,
  adminCreateSchema,
  adminPasswordChangeSchema,
  adminReasonSchema,
  adminStatusSchema,
  adminTotpCodeSchema,
  adminTotpConfirmSchema,
  adminUpdateSchema,
} from '@goalbet/shared';
import { AdminAuthGuard, type AuthedAdmin, CurrentAdmin, Roles } from '../../common/auth/guards.js';
import { ReqMeta, type RequestMeta } from '../../common/request-meta.js';
import { ZBody } from '../../common/zod.js';
import { AdminAccountsService } from './admin-accounts.service.js';
import { actorOf } from './admin-actor.js';

const me = (a: AuthedAdmin, meta: RequestMeta) => ({ ...actorOf(a, meta), id: a.id });

/** The signed-in admin's own account: name, password, moving 2FA, active sessions. */
@ApiTags('admin-account')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/account')
export class AdminAccountController {
  constructor(private readonly accounts: AdminAccountsService) {}

  @Get()
  get(@CurrentAdmin() admin: AuthedAdmin) {
    return this.accounts.account(admin.id, admin.sessionId);
  }

  @Patch()
  rename(@CurrentAdmin() admin: AuthedAdmin, @ZBody(adminAccountUpdateSchema) body: z.output<typeof adminAccountUpdateSchema>, @ReqMeta() meta: RequestMeta) {
    return this.accounts.rename(me(admin, meta), admin.sessionId, body.name);
  }

  @Post('password')
  @HttpCode(200)
  password(@CurrentAdmin() admin: AuthedAdmin, @ZBody(adminPasswordChangeSchema) body: z.output<typeof adminPasswordChangeSchema>, @ReqMeta() meta: RequestMeta) {
    return this.accounts.changePassword(me(admin, meta), admin.sessionId, body);
  }

  @Post('totp/start')
  @HttpCode(200)
  startTotp(@CurrentAdmin() admin: AuthedAdmin, @ZBody(adminTotpCodeSchema) body: z.output<typeof adminTotpCodeSchema>, @ReqMeta() meta: RequestMeta) {
    return this.accounts.startTotpChange(me(admin, meta), body.totp);
  }

  @Post('totp/confirm')
  @HttpCode(200)
  confirmTotp(@CurrentAdmin() admin: AuthedAdmin, @ZBody(adminTotpConfirmSchema) body: z.output<typeof adminTotpConfirmSchema>, @ReqMeta() meta: RequestMeta) {
    return this.accounts.confirmTotpChange(me(admin, meta), admin.sessionId, body.setupToken, body.totp);
  }

  @Delete('sessions/others')
  endOthers(@CurrentAdmin() admin: AuthedAdmin, @ReqMeta() meta: RequestMeta) {
    return this.accounts.endSession(me(admin, meta), admin.sessionId, 'others');
  }

  @Delete('sessions/:id')
  endOne(@CurrentAdmin() admin: AuthedAdmin, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.accounts.endSession(me(admin, meta), admin.sessionId, id);
  }
}

/** Super admin: create admins, edit name/email/role, suspend, reset password or 2FA. */
@ApiTags('admin-admins')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Roles('SUPER_ADMIN')
@Controller('admin/admins')
export class AdminAdminsController {
  constructor(private readonly accounts: AdminAccountsService) {}

  @Get()
  list() {
    return this.accounts.list();
  }

  @Post()
  create(@CurrentAdmin() admin: AuthedAdmin, @ZBody(adminCreateSchema) body: z.output<typeof adminCreateSchema>, @ReqMeta() meta: RequestMeta) {
    return this.accounts.create(me(admin, meta), body);
  }

  @Patch(':id')
  update(
    @CurrentAdmin() admin: AuthedAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @ZBody(adminUpdateSchema) body: z.output<typeof adminUpdateSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.accounts.update(me(admin, meta), id, body);
  }

  @Post(':id/status')
  @HttpCode(200)
  status(
    @CurrentAdmin() admin: AuthedAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @ZBody(adminStatusSchema) body: z.output<typeof adminStatusSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.accounts.setStatus(me(admin, meta), id, body.status, body.reason);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  resetPassword(
    @CurrentAdmin() admin: AuthedAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @ZBody(adminReasonSchema) body: z.output<typeof adminReasonSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.accounts.resetPassword(me(admin, meta), id, body.reason);
  }

  @Post(':id/reset-2fa')
  @HttpCode(200)
  resetTotp(
    @CurrentAdmin() admin: AuthedAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @ZBody(adminReasonSchema) body: z.output<typeof adminReasonSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.accounts.resetTotp(me(admin, meta), id, body.reason);
  }
}
