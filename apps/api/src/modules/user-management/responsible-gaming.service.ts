import { Injectable } from '@nestjs/common';
import { type UserLimitType } from '@goalbet/db';
import { type Actor, AuditService } from '../../common/audit.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { effectiveLimit } from '../../common/limits.js';

const COOLING_OFF_MS = 24 * 3600_000;
const DAY = 86_400_000;

/**
 * F1.4 self-limits and self-exclusion. Lowering (or adding) a limit applies at once; raising or
 * removing one only takes effect after a 24 h cooling-off period. Self-exclusion cannot be undone
 * by the player.
 */
@Injectable()
export class ResponsibleGamingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async limits(userId: string) {
    const rows = await this.prisma.userLimit.findMany({ where: { userId } });
    return rows.map((l) => ({
      type: l.type,
      source: l.source,
      amountBani: effectiveLimit(l),
      pendingAmountBani: l.pendingAmountBani !== null && l.effectiveAt.getTime() > Date.now() ? (l.pendingAmountBani || null) : null,
      pendingRemoval: l.pendingAmountBani === 0 && l.effectiveAt.getTime() > Date.now(),
      effectiveAt: l.effectiveAt.toISOString(),
    }));
  }

  async setLimit(userId: string, type: UserLimitType, amountBani: number | null, actor: Actor) {
    const existing = await this.prisma.userLimit.findUnique({ where: { userId_type_source: { userId, type, source: 'USER' } } });
    const current = existing ? effectiveLimit(existing) : null;
    const now = new Date();
    const later = new Date(now.getTime() + COOLING_OFF_MS);

    let data: { amountBani: number; pendingAmountBani: number | null; effectiveAt: Date } | null;
    if (amountBani === null) {
      data = existing && current !== null ? { amountBani: current, pendingAmountBani: 0, effectiveAt: later } : null;
    } else if (current === null || amountBani <= current) {
      data = { amountBani, pendingAmountBani: null, effectiveAt: now };
    } else {
      data = { amountBani: current, pendingAmountBani: amountBani, effectiveAt: later };
    }
    if (data) {
      await this.prisma.userLimit.upsert({
        where: { userId_type_source: { userId, type, source: 'USER' } },
        create: { userId, type, source: 'USER', ...data },
        update: data,
      });
    } else if (existing) {
      await this.prisma.userLimit.delete({ where: { id: existing.id } });
    }
    await this.audit.log({
      category: 'SYSTEM',
      action: 'USER_LIMIT_SET',
      actor,
      entityType: 'User',
      entityId: userId,
      before: { type, amountBani: current },
      after: { type, requestedBani: amountBani, ...(data ?? {}) },
    });
    return this.limits(userId);
  }

  async activeExclusion(userId: string) {
    const now = new Date();
    return this.prisma.selfExclusion.findFirst({
      where: { userId, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      orderBy: { endsAt: { sort: 'desc', nulls: 'first' } },
    });
  }

  async selfExclude(userId: string, days: number | null, reason: string | undefined, actor: Actor) {
    const endsAt = days === null ? null : new Date(Date.now() + days * DAY);
    const row = await this.prisma.selfExclusion.create({ data: { userId, endsAt, reason: reason ?? null } });
    await this.audit.log({
      category: 'SYSTEM',
      action: 'USER_SELF_EXCLUDED',
      actor,
      entityType: 'User',
      entityId: userId,
      after: { endsAt: endsAt?.toISOString() ?? 'permanent', reason: reason ?? null },
    });
    return { id: row.id, endsAt: row.endsAt?.toISOString() ?? null };
  }
}
