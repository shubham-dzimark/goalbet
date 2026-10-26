import { Injectable } from '@nestjs/common';
import { type Prisma, type UserLimitType } from '@goalbet/db';
import { type AdminUserDetail, type AdminUserRow, OPEN_TICKET_STATUSES } from '@goalbet/shared';
import { type Actor, AuditService } from '../../common/audit.service.js';
import { SessionService } from '../../common/auth/session.service.js';
import { DomainError } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';

const rowSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  wallet: { select: { balanceBani: true } },
  _count: { select: { tickets: { where: { status: { in: OPEN_TICKET_STATUSES } } } } },
} satisfies Prisma.UserSelect;

type UserRowData = Prisma.UserGetPayload<{ select: typeof rowSelect }>;

const toRow = (u: UserRowData): AdminUserRow => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  status: u.status,
  balanceBani: u.wallet?.balanceBani ?? 0,
  openTickets: u._count.tickets,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
});

/** F3.2 user management: find, view, edit, suspend/activate, operator limits. Every change is audited. */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

  async list(q: { q?: string | undefined; status?: 'ACTIVE' | 'SUSPENDED' | undefined; cursor?: string | undefined; limit: number }) {
    const term = q.q?.trim();
    const contains = { contains: term, mode: 'insensitive' as const };
    const rows = await this.prisma.user.findMany({
      where: {
        ...(term ? { OR: [{ email: contains }, { phone: contains }, { name: contains }] } : {}),
        ...(q.status ? { status: q.status } : {}),
      },
      select: rowSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, q.limit).map(toRow);
    return { items, nextCursor: rows.length > q.limit ? (items.at(-1)?.id ?? null) : null };
  }

  async detail(id: string): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...rowSelect,
        dateOfBirth: true,
        locale: true,
        oddsChangePreference: true,
        limits: { orderBy: [{ type: 'asc' }, { source: 'asc' }] },
        selfExclusions: { orderBy: { startsAt: 'desc' }, take: 1 },
      },
    });
    if (!user) throw new DomainError('NOT_FOUND');

    const [all, open, won, lost, rejections] = await Promise.all([
      this.prisma.ticket.aggregate({
        where: { userId: id, status: { not: 'REJECTED' } },
        _count: true,
        _sum: { stakeBani: true, payoutBani: true, cashedOutBani: true },
      }),
      this.prisma.ticket.aggregate({ where: { userId: id, status: { in: OPEN_TICKET_STATUSES } }, _sum: { stakeBani: true } }),
      this.prisma.ticket.count({ where: { userId: id, status: 'WON' } }),
      this.prisma.ticket.count({ where: { userId: id, status: 'LOST' } }),
      this.prisma.betAttempt.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 10, select: { code: true, createdAt: true } }),
    ]);

    const now = Date.now();
    const exclusion = user.selfExclusions[0];
    const activeExclusion = exclusion && (!exclusion.endsAt || exclusion.endsAt.getTime() > now) ? exclusion : null;

    return {
      ...toRow(user),
      dateOfBirth: user.dateOfBirth.toISOString().slice(0, 10),
      locale: user.locale,
      oddsChangePreference: user.oddsChangePreference,
      limits: user.limits.map((l) => ({
        type: l.type,
        source: l.source,
        amountBani: l.amountBani,
        pendingAmountBani: l.pendingAmountBani,
        effectiveAt: l.effectiveAt.toISOString(),
      })),
      selfExclusion: activeExclusion
        ? { startsAt: activeExclusion.startsAt.toISOString(), endsAt: activeExclusion.endsAt?.toISOString() ?? null, reason: activeExclusion.reason }
        : null,
      stats: {
        tickets: all._count,
        openStakeBani: open._sum.stakeBani ?? 0,
        totalStakedBani: all._sum.stakeBani ?? 0,
        totalReturnedBani: (all._sum.payoutBani ?? 0) + (all._sum.cashedOutBani ?? 0),
        won,
        lost,
      },
      recentRejections: rejections.map((r) => ({ code: r.code, createdAt: r.createdAt.toISOString() })),
    };
  }

  async update(actor: Actor, id: string, patch: { name?: string | undefined; phone?: string | undefined; locale?: 'ro' | 'en' | undefined }) {
    const before = await this.prisma.user.findUnique({ where: { id }, select: { name: true, phone: true, locale: true } });
    if (!before) throw new DomainError('NOT_FOUND');
    if (patch.phone && patch.phone !== before.phone) {
      const taken = await this.prisma.user.findUnique({ where: { phone: patch.phone }, select: { id: true } });
      if (taken) throw new DomainError('PHONE_TAKEN');
    }
    const data = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Prisma.UserUpdateInput;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data });
      await this.audit.log({ category: 'ADMIN', action: 'USER_UPDATED', actor, entityType: 'User', entityId: id, before, after: data }, tx);
    });
    return this.detail(id);
  }

  async setStatus(actor: Actor, id: string, status: 'ACTIVE' | 'SUSPENDED', reason: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { status: true } });
    if (!user) throw new DomainError('NOT_FOUND');
    if (user.status !== status) {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: { status } });
        await this.audit.log(
          {
            category: 'ADMIN',
            action: status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_ACTIVATED',
            actor,
            entityType: 'User',
            entityId: id,
            before: { status: user.status },
            after: { status },
            meta: { reason },
          },
          tx,
        );
      });
      // a suspended player is logged out everywhere at once
      if (status === 'SUSPENDED') await this.sessions.revokeAll('USER', id);
    }
    return this.detail(id);
  }

  /** Operator limit (source ADMIN): applies immediately, no cooling-off; the strictest limit wins. */
  async setLimit(actor: Actor, id: string, input: { type: string; amountBani: number | null; reason: string }) {
    const type = input.type as UserLimitType;
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new DomainError('NOT_FOUND');
    const where = { userId_type_source: { userId: id, type, source: 'ADMIN' as const } };
    const before = await this.prisma.userLimit.findUnique({ where });
    await this.prisma.$transaction(async (tx) => {
      if (input.amountBani === null) {
        if (before) await tx.userLimit.delete({ where });
      } else {
        await tx.userLimit.upsert({
          where,
          create: { userId: id, type, source: 'ADMIN', amountBani: input.amountBani },
          update: { amountBani: input.amountBani, pendingAmountBani: null, effectiveAt: new Date() },
        });
      }
      await this.audit.log(
        {
          category: 'ADMIN',
          action: input.amountBani === null ? 'USER_LIMIT_REMOVED' : 'USER_LIMIT_SET',
          actor,
          entityType: 'User',
          entityId: id,
          before: before ? { type, amountBani: before.amountBani } : null,
          after: input.amountBani === null ? null : { type, amountBani: input.amountBani },
          meta: { reason: input.reason, source: 'ADMIN' },
        },
        tx,
      );
    });
    return this.detail(id);
  }
}
