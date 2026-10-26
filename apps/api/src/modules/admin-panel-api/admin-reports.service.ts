import { Injectable } from '@nestjs/common';
import { type AuditLog } from '@goalbet/db';
import { type AdminAuditRow, type AdminDashboard, type AdminReport, OPEN_TICKET_STATUSES, type TicketStatus } from '@goalbet/shared';
import { PrismaService } from '../../common/prisma.service.js';

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

/** Money flows come from the ledger (WalletTransaction), so reports always match the balances. */
type LedgerTotals = { stakes: bigint; payouts: bigint; credits: bigint; debits: bigint; deposits: bigint; withdrawals: bigint };

export function toAuditRow(a: AuditLog): AdminAuditRow {
  return {
    id: a.id,
    category: a.category,
    action: a.action,
    actorType: a.actorType,
    actorId: a.actorId,
    actorLabel: a.actorLabel,
    entityType: a.entityType,
    entityId: a.entityId,
    before: a.before,
    after: a.after,
    meta: a.meta,
    ip: a.ip,
    createdAt: a.createdAt.toISOString(),
  };
}

/** F3.6 reports (users, stakes, payouts, open exposure, transaction logs) and the admin dashboard. */
@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ledger(from: Date, to: Date): Promise<LedgerTotals> {
    const [row] = await this.prisma.$queryRaw<LedgerTotals[]>`
      SELECT
        COALESCE(SUM(-"amountBani") FILTER (WHERE type = 'STAKE'), 0)::bigint AS stakes,
        COALESCE(SUM("amountBani") FILTER (WHERE type IN ('WIN', 'CASHOUT', 'REFUND', 'VOID_REVERSAL')), 0)::bigint AS payouts,
        COALESCE(SUM("amountBani") FILTER (WHERE type = 'ADMIN_CREDIT'), 0)::bigint AS credits,
        COALESCE(SUM(-"amountBani") FILTER (WHERE type = 'ADMIN_DEBIT'), 0)::bigint AS debits,
        COALESCE(SUM("amountBani") FILTER (WHERE type = 'DEPOSIT'), 0)::bigint AS deposits,
        COALESCE(SUM(-"amountBani") FILTER (WHERE type = 'WITHDRAWAL'), 0)::bigint AS withdrawals
      FROM "WalletTransaction" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}`;
    return row ?? { stakes: 0n, payouts: 0n, credits: 0n, debits: 0n, deposits: 0n, withdrawals: 0n };
  }

  /** One row per day in [from, to), zeros included. */
  private async daily(from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<{ date: Date; stakes: bigint; payouts: bigint; tickets: bigint }[]>`
      SELECT d::date AS date,
        COALESCE((SELECT SUM(-t."amountBani") FROM "WalletTransaction" t
                  WHERE t.type = 'STAKE' AND t."createdAt" >= d AND t."createdAt" < d + interval '1 day'), 0)::bigint AS stakes,
        COALESCE((SELECT SUM(t."amountBani") FROM "WalletTransaction" t
                  WHERE t.type IN ('WIN', 'CASHOUT', 'REFUND', 'VOID_REVERSAL') AND t."createdAt" >= d AND t."createdAt" < d + interval '1 day'), 0)::bigint AS payouts,
        (SELECT COUNT(*) FROM "Ticket" k
          WHERE k.status <> 'REJECTED' AND k."placedAt" >= d AND k."placedAt" < d + interval '1 day')::bigint AS tickets
      FROM generate_series(${from}::timestamptz, ${new Date(to.getTime() - DAY)}::timestamptz, interval '1 day') AS d
      ORDER BY d`;
    return rows.map((r) => ({ date: isoDay(r.date), stakesBani: num(r.stakes), payoutsBani: num(r.payouts), tickets: num(r.tickets) }));
  }

  private async exposure() {
    const open = await this.prisma.ticket.aggregate({
      where: { status: { in: OPEN_TICKET_STATUSES } },
      _count: true,
      _sum: { stakeBani: true, potentialWinBani: true },
    });
    return { openTickets: open._count, openStakeBani: open._sum.stakeBani ?? 0, potentialPayoutBani: open._sum.potentialWinBani ?? 0 };
  }

  async report(q: { from?: string | undefined; to?: string | undefined }): Promise<AdminReport> {
    const today = new Date(`${isoDay(new Date())}T00:00:00Z`);
    const to = q.to ? new Date(new Date(`${q.to}T00:00:00Z`).getTime() + DAY) : new Date(today.getTime() + DAY);
    const from = q.from ? new Date(`${q.from}T00:00:00Z`) : new Date(to.getTime() - 30 * DAY);
    const range = { createdAt: { gte: from, lt: to } };
    const placed = { placedAt: { gte: from, lt: to }, status: { not: 'REJECTED' as const } };

    const [totalUsers, newUsers, suspended, activeUsers, tickets, byStatus, ledger, exposure, daily, top] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: range }),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.ticket.groupBy({ by: ['userId'], where: placed }).then((g) => g.length),
      this.prisma.ticket.count({ where: placed }),
      this.prisma.ticket.groupBy({ by: ['status'], where: { placedAt: { gte: from, lt: to } }, _count: true }),
      this.ledger(from, to),
      this.exposure(),
      this.daily(from, to),
      // liability per match: potential payout of the open tickets that include it
      this.prisma.$queryRaw<{ eventId: string; home: string; away: string; startTime: Date; status: AdminReport['topExposure'][number]['status']; tickets: bigint; potential: bigint }[]>`
        SELECT e.id AS "eventId", e."homeTeam" AS home, e."awayTeam" AS away, e."startTime", e.status,
               COUNT(*)::bigint AS tickets, COALESCE(SUM(x.potential), 0)::bigint AS potential
        FROM (
          -- one row per (match, open ticket), however many legs the ticket has on that match
          SELECT DISTINCT l."eventId", t.id, t."potentialWinBani" AS potential
          FROM "TicketLeg" l JOIN "Ticket" t ON t.id = l."ticketId"
          WHERE t.status IN ('PENDING', 'ACTIVE', 'LIVE')
        ) x
        JOIN "Event" e ON e.id = x."eventId"
        GROUP BY e.id ORDER BY potential DESC LIMIT 10`,
    ]);

    const stakes = num(ledger.stakes);
    const payouts = num(ledger.payouts);
    return {
      range: { from: isoDay(from), to: isoDay(new Date(to.getTime() - DAY)) },
      users: { total: totalUsers, new: newUsers, active: activeUsers, suspended },
      betting: { tickets, stakesBani: stakes, payoutsBani: payouts, ggrBani: stakes - payouts, avgStakeBani: tickets ? Math.round(stakes / tickets) : 0 },
      wallet: { creditsBani: num(ledger.credits), debitsBani: num(ledger.debits), depositsBani: num(ledger.deposits), withdrawalsBani: num(ledger.withdrawals) },
      byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count])) as Partial<Record<TicketStatus, number>>,
      exposure,
      daily,
      topExposure: top.map((r) => ({
        eventId: r.eventId,
        name: `${r.home} – ${r.away}`,
        startTime: r.startTime.toISOString(),
        status: r.status,
        tickets: num(r.tickets),
        potentialPayoutBani: num(r.potential),
      })),
    };
  }

  async dashboard(): Promise<AdminDashboard> {
    const today = new Date(`${isoDay(new Date())}T00:00:00Z`);
    const tomorrow = new Date(today.getTime() + DAY);
    const [liveEvents, pendingApprovals, pendingPayments, todayTickets, newUsers, ledger, exposure, last7, audit] = await Promise.all([
      this.prisma.event.count({ where: { status: 'LIVE', competition: { active: true } } }),
      this.prisma.creditApproval.count({ where: { status: 'PENDING' } }),
      this.prisma.paymentRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.ticket.count({ where: { placedAt: { gte: today, lt: tomorrow }, status: { not: 'REJECTED' } } }),
      this.prisma.user.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      this.ledger(today, tomorrow),
      this.exposure(),
      this.daily(new Date(today.getTime() - 6 * DAY), tomorrow),
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
    ]);
    return {
      liveEvents,
      openTickets: exposure.openTickets,
      pendingApprovals,
      pendingPayments,
      today: { tickets: todayTickets, stakesBani: num(ledger.stakes), payoutsBani: num(ledger.payouts), newUsers },
      exposureBani: exposure.potentialPayoutBani,
      last7Days: last7.map(({ date, stakesBani, payoutsBani }) => ({ date, stakesBani, payoutsBani })),
      recentAudit: audit.map(toAuditRow),
    };
  }
}

