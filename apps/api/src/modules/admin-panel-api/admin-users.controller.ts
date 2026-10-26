import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { adminUserLimitSchema, adminUserListQuerySchema, adminUserStatusSchema, adminUserUpdateSchema } from '@goalbet/shared';
import { AdminAuthGuard, type AuthedAdmin, CurrentAdmin, Roles } from '../../common/auth/guards.js';
import { ReqMeta, type RequestMeta } from '../../common/request-meta.js';
import { ZBody, ZQuery } from '../../common/zod.js';
import { AdminUsersService } from './admin-users.service.js';
import { actorOf } from './admin-actor.js';

/** F3.2 user management. Viewing: any admin. Changes: OPERATOR (SUPER_ADMIN always). */
@ApiTags('admin-users')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@ZQuery(adminUserListQuerySchema) q: z.output<typeof adminUserListQuerySchema>) {
    return this.users.list(q);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.detail(id);
  }

  @Patch(':id')
  @Roles('OPERATOR')
  update(
    @CurrentAdmin() admin: AuthedAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @ZBody(adminUserUpdateSchema) body: z.output<typeof adminUserUpdateSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.users.update(actorOf(admin, meta), id, body);
  }

  @Post(':id/status')
  @Roles('OPERATOR')
  @HttpCode(200)
  status(
    @CurrentAdmin() admin: AuthedAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @ZBody(adminUserStatusSchema) body: z.output<typeof adminUserStatusSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.users.setStatus(actorOf(admin, meta), id, body.status, body.reason);
  }

  @Put(':id/limits')
  @Roles('OPERATOR')
  limit(
    @CurrentAdmin() admin: AuthedAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @ZBody(adminUserLimitSchema) body: z.output<typeof adminUserLimitSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.users.setLimit(actorOf(admin, meta), id, body);
  }
}
