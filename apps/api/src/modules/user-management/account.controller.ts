import { Controller, Get, HttpCode, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma, type UserLimitType } from '@goalbet/db';
import { type z } from 'zod';
import { OPEN_TICKET_STATUSES, selfExclusionSchema, setLimitSchema, updateProfileSchema } from '@goalbet/shared';
import { AuditService } from '../../common/audit.service.js';
import { type AuthedUser, CurrentUser, UserAuthGuard } from '../../common/auth/guards.js';
import { DomainError } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { ReqMeta, type RequestMeta } from '../../common/request-meta.js';
import { ZBody } from '../../common/zod.js';
import { ResponsibleGamingService } from './responsible-gaming.service.js';
import { toUserDto } from './user.dto.js';

/** F1.4 — the player's own account: profile, language, dashboard, self-limits, self-exclusion. */
@ApiTags('account')
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller('me')
export class AccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rg: ResponsibleGamingService,
  ) {}

  @Get()
  async me(@CurrentUser() u: AuthedUser) {
    const user = await this.prisma.user.findUnique({ where: { id: u.id }, include: { wallet: true } });
    if (!user) throw new DomainError('UNAUTHORIZED');
    return toUserDto(user, user.wallet);
  }

  /** Dashboard: balance, open tickets, recent activity, limits and exclusion status. */
  @Get('dashboard')
  async dashboard(@CurrentUser() u: AuthedUser) {
    const user = await this.prisma.user.findUnique({ where: { id: u.id }, include: { wallet: true } });
    if (!user || !user.wallet) throw new DomainError('UNAUTHORIZED');
    const [openTickets, openStakes, recent, limits, exclusion] = await Promise.all([
      this.prisma.ticket.count({ where: { userId: u.id, status: { in: OPEN_TICKET_STATUSES } } }),
      this.prisma.ticket.aggregate({
        where: { userId: u.id, status: { in: OPEN_TICKET_STATUSES } },
        _sum: { stakeBani: true, potentialWinBani: true },
      }),
      this.prisma.walletTransaction.findMany({
        where: { walletId: user.wallet.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5,
        include: { ticket: { select: { code: true } } },
      }),
      this.rg.limits(u.id),
      this.rg.activeExclusion(u.id),
    ]);
    return {
      user: toUserDto(user, user.wallet),
      openTickets,
      openStakeBani: openStakes._sum.stakeBani ?? 0,
      openPotentialWinBani: openStakes._sum.potentialWinBani ?? 0,
      recentTransactions: recent.map((t) => ({
        id: t.id,
        type: t.type,
        amountBani: t.amountBani,
        balanceAfterBani: t.balanceAfterBani,
        reason: t.reason,
        ticketId: t.ticketId,
        ticketCode: t.ticket?.code ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
      limits,
      selfExclusion: exclusion ? { endsAt: exclusion.endsAt?.toISOString() ?? null } : null,
    };
  }

  /** Profile edit, language (F0.3) and odds-change preference. */
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
        before: { name: before.name, phone: before.phone, locale: before.locale, oddsChangePreference: before.oddsChangePreference, realityCheckMinutes: before.realityCheckMinutes },
        after: body,
      });
      return toUserDto(user, user.wallet);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new DomainError('PHONE_TAKEN');
      throw e;
    }
  }

  @Get('limits')
  limits(@CurrentUser() u: AuthedUser) {
    return this.rg.limits(u.id);
  }

  @Put('limits')
  setLimit(
    @CurrentUser() u: AuthedUser,
    @ZBody(setLimitSchema) body: z.output<typeof setLimitSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.rg.setLimit(u.id, body.type as UserLimitType, body.amountBani, { type: 'USER', id: u.id, ...meta });
  }

  @Post('self-exclusion')
  @HttpCode(201)
  selfExclude(
    @CurrentUser() u: AuthedUser,
    @ZBody(selfExclusionSchema) body: z.output<typeof selfExclusionSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.rg.selfExclude(u.id, body.days, body.reason, { type: 'USER', id: u.id, ...meta });
  }
}
