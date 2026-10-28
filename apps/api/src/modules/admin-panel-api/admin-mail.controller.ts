import { Controller, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { adminMailTestSchema, adminMailUpdateSchema } from '@goalbet/shared';
import { AdminAuthGuard, type AuthedAdmin, CurrentAdmin, Roles } from '../../common/auth/guards.js';
import { MailConfigService } from '../../common/mail-config.service.js';
import { ReqMeta, type RequestMeta } from '../../common/request-meta.js';
import { ZBody } from '../../common/zod.js';
import { actorOf } from './admin-actor.js';

/** Outgoing email (SMTP) settings, managed by Super admins without server access. */
@ApiTags('admin-mail')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Roles('SUPER_ADMIN')
@Controller('admin/mail')
export class AdminMailController {
  constructor(private readonly mail: MailConfigService) {}

  @Get()
  status() {
    return this.mail.status();
  }

  @Put()
  update(@CurrentAdmin() admin: AuthedAdmin, @ZBody(adminMailUpdateSchema) body: z.output<typeof adminMailUpdateSchema>, @ReqMeta() meta: RequestMeta) {
    return this.mail.save({ ...actorOf(admin, meta), id: admin.id }, body);
  }

  /** Send a test email with the given settings (not saved). */
  @Post('test')
  @HttpCode(200)
  test(@CurrentAdmin() admin: AuthedAdmin, @ZBody(adminMailTestSchema) body: z.output<typeof adminMailTestSchema>, @ReqMeta() meta: RequestMeta) {
    const { to, password, ...settings } = body;
    return this.mail.test(actorOf(admin, meta), { ...settings, password: password ?? null, to });
  }
}
