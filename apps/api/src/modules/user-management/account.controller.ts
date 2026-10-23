import { Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@goalbet/db';
import { type z } from 'zod';
import { updateProfileSchema } from '@goalbet/shared';
import { AuditService } from '../../common/audit.service.js';
import { type AuthedUser, CurrentUser, UserAuthGuard } from '../../common/auth/guards.js';
import { DomainError } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { ReqMeta, type RequestMeta } from '../../common/request-meta.js';
import { ZBody } from '../../common/zod.js';
import { toUserDto } from './user.dto.js';

/** F1.4 — the player's own account. */
@ApiTags('account')
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller('me')
export class AccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async me(@CurrentUser() u: AuthedUser) {
    const user = await this.prisma.user.findUnique({ where: { id: u.id }, include: { wallet: true } });
    if (!user) throw new DomainError('UNAUTHORIZED');
    return toUserDto(user, user.wallet);
  }

  /** Profile edit + language preference (F0.3: remembered per user). */
  @Patch()
  async update(
    @CurrentUser() u: AuthedUser,
    @ZBody(updateProfileSchema) body: z.output<typeof updateProfileSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    try {
      const user = await this.prisma.user.update({ where: { id: u.id }, data: body, include: { wallet: true } });
      await this.audit.log({
        category: 'SYSTEM',
        action: 'USER_PROFILE_UPDATED',
        actor: { type: 'USER', id: u.id, ...meta },
        entityType: 'User',
        entityId: u.id,
        before: { name: before.name, phone: before.phone, locale: before.locale },
        after: body,
      });
      return toUserDto(user, user.wallet);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new DomainError('PHONE_TAKEN');
      throw e;
    }
  }
}
