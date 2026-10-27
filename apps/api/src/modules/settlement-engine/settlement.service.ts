import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Prisma } from '@goalbet/db';
import {
  type AdminSettleEventInput,
  type AdminSettlementResult,
  type EventStateMessage,
  type MarketSpec,
  type MatchOutcome,
  OPEN_TICKET_STATUSES,
  type SelectionResult,
  type TicketMessage,
  combineBuilderParts,
  parseLineCenti,
  parseOddsMilli,
  settleSelection,
  settleTicketPayout,
} from '@goalbet/shared';
import { type Actor, AuditService, SYSTEM_ACTOR } from '../../common/audit.service.js';
import { DomainError } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { Channels, RedisService } from '../../common/redis.service.js';
import { ODDS_PROVIDER, type OddsProvider } from '../api-integration/odds-provider.js';
import { WalletService } from '../wallet-ledger/wallet.service.js';

type Settled = Exclude<SelectionResult, 'PENDING'>;

/** Kick-off + 2 h of play + margin: a match still not finished by then is overdue. */
export const OVERDUE_AFTER_MS = 3 * 3600_000;

interface SettleOptions {
  outcome: MatchOutcome;
  source: 'PROVIDER' | 'ADMIN';
  actor: Actor;
  reason?: string;
}

/** Tickets settled inside the transaction, told to their players after commit. */
interface SettledTicket {
  id: string;
  userId: string;
  status: 'WON' | 'LOST' | 'VOID';
}

/**
 * F4.2 SettlementEngine (F2.8–F2.11). One transaction per match: every selection is graded
 * against the result, then every leg, then every ticket whose legs are all decided (a lost leg
 * decides an accumulator at once). Winnings (WIN) and void refunds (REFUND) go through the
 * ledger with `WIN:<ticket>` / `REFUND:<ticket>` references, so nothing is ever paid twice.
 * Cashed-out tickets keep their legs graded for display but are never paid again.
 */
@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
    @Inject(ODDS_PROVIDER) private readonly provider: OddsProvider,
  ) {}

  /**
   * F2.8 automatic settlement (worker job): finished or cancelled matches without settledAt are
   * settled as soon as the provider has their final result. Matches the feed never finished
   * (e.g. the worker was down) are asked about too once overdue, if they still carry open bets.
   */
  async settlePending(limit = 20) {
    const events = await this.prisma.event.findMany({
      where: {
        settledAt: null,
        OR: [
          { status: { in: ['FINISHED', 'CANCELLED'] } },
          {
            status: { in: ['SCHEDULED', 'LIVE'] },
            startTime: { lt: new Date(Date.now() - OVERDUE_AFTER_MS) },
            legs: { some: { ticket: { status: { in: OPEN_TICKET_STATUSES } } } },
          },
        ],
      },
      select: { id: true, providerRef: true, status: true },
      orderBy: { startTime: 'asc' },
      take: limit,
    });
    let settled = 0;
    let waiting = 0;
    let failed = 0;
    for (const ev of events) {
      const result = await this.provider.getResult(ev.providerRef).catch(() => null);
      if (!result) {
        waiting++;
        continue;
      }
      try {
        const cancelled = result.status === 'CANCELLED' || !!result.outcome.cancelled;
        await this.settleEvent(ev.id, { outcome: { ...result.outcome, cancelled }, source: 'PROVIDER', actor: SYSTEM_ACTOR });
        settled++;
      } catch (e) {
        if (e instanceof DomainError && e.code === 'EVENT_ALREADY_SETTLED') continue;
        failed++;
        await this.reportFailure(ev.id, e);
      }
    }
    return { settled, waiting, failed };
  }

  /** F2.9 manual settlement: an operator enters the final result (audited with a reason). */
  async settleManually(actor: Actor, eventId: string, input: AdminSettleEventInput): Promise<AdminSettlementResult> {
    const ev = await this.prisma.event.findUnique({ where: { id: eventId }, select: { startTime: true, settledAt: true } });
    if (!ev) throw new DomainError('NOT_FOUND');
    if (ev.settledAt) throw new DomainError('EVENT_ALREADY_SETTLED');
    // a match can be called off before kick-off, but only played matches have a result
    if (!input.cancelled && ev.startTime.getTime() > Date.now()) throw new DomainError('SETTLEMENT_NOT_READY');
    const outcome: MatchOutcome = {
      cancelled: !!input.cancelled,
      ftHome: input.ftHome,
      ftAway: input.ftAway,
      htHome: input.htHome,
      htAway: input.htAway,
      corners: input.corners,
      cards: input.cards,
      // no player stats from an operator: player markets are void
      players: {},
    };
    return this.settleEvent(eventId, { outcome, source: 'ADMIN', actor, reason: input.reason });
  }

  async settleEvent(eventId: string, opts: SettleOptions): Promise<AdminSettlementResult> {
    const settled: SettledTicket[] = [];
    const result = await this.prisma.$transaction(
      async (tx) => {
        // one settlement per match, even when the worker and an operator race
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId}::uuid FOR UPDATE`;
        const ev = await tx.event.findUnique({ where: { id: eventId }, include: { markets: { include: { selections: true } } } });
        if (!ev) throw new DomainError('NOT_FOUND');
        if (ev.settledAt) throw new DomainError('EVENT_ALREADY_SETTLED');
        const now = new Date();
        const { outcome } = opts;
        const status = outcome.cancelled ? 'CANCELLED' : 'FINISHED';

        // F2.9 selections and markets
        const results = new Map<string, Settled>();
        for (const m of ev.markets) {
          const spec: MarketSpec = { type: m.type, period: m.period, line: parseLineCenti(m.line), team: m.team, playerRef: m.playerRef };
          for (const s of m.selections) results.set(s.id, gradeSafely(spec, s.outcome, outcome));
        }
        for (const [value, ids] of groupBy(results)) {
          await tx.selection.updateMany({ where: { id: { in: ids } }, data: { result: value } });
          await tx.ticketLegSelection.updateMany({ where: { selectionId: { in: ids } }, data: { result: value } });
        }
        await tx.market.updateMany({ where: { eventId }, data: { status: 'SETTLED' } });

        // legs on this match
        const legs = await tx.ticketLeg.findMany({
          where: { eventId, status: 'PENDING' },
          select: { id: true, ticketId: true, kind: true, selections: { select: { selectionId: true } } },
        });
        const legResults = new Map<string, Settled>();
        for (const leg of legs) {
          const parts = leg.selections.map((s) => results.get(s.selectionId) ?? 'VOID');
          legResults.set(leg.id, leg.kind === 'BET_BUILDER' ? combineBuilderParts(parts) : (parts[0] ?? 'VOID'));
        }
        for (const [value, ids] of groupBy(legResults)) {
          await tx.ticketLeg.updateMany({ where: { id: { in: ids } }, data: { status: value, settledAt: now } });
        }

        // F2.10 tickets: wallet rows are locked in user order so concurrent settlements cannot deadlock
        const tickets = await tx.ticket.findMany({
          where: { id: { in: [...new Set(legs.map((l) => l.ticketId))] }, status: { in: OPEN_TICKET_STATUSES } },
          select: { id: true, code: true, userId: true, stakeBani: true, legs: { select: { oddsAtPlacement: true, status: true } } },
          orderBy: [{ userId: 'asc' }, { id: 'asc' }],
        });
        let paidBani = 0;
        for (const t of tickets) {
          const decided = t.legs.some((l) => l.status === 'LOST') || t.legs.every((l) => l.status !== 'PENDING');
          if (!decided) continue;
          const payout = settleTicketPayout(
            t.stakeBani,
            t.legs.map((l) => ({ oddsMilli: parseOddsMilli(l.oddsAtPlacement), status: l.status })),
          );
          // a ticket cashed out a moment ago is no longer open: skip it
          const { count } = await tx.ticket.updateMany({
            where: { id: t.id, status: { in: OPEN_TICKET_STATUSES } },
            data: { status: payout.outcome, payoutBani: payout.payoutBani, settledAt: now },
          });
          if (count === 0) continue;
          // F2.11 credit the wallet
          if (payout.payoutBani > 0) {
            const refund = payout.outcome === 'VOID';
            await this.wallet.apply(tx, {
              userId: t.userId,
              type: refund ? 'REFUND' : 'WIN',
              amountBani: payout.payoutBani,
              reason: `${refund ? 'Refund' : 'Winnings'} ${t.code}`,
              actor: opts.actor,
              ticketId: t.id,
              uniqueRef: `${refund ? 'REFUND' : 'WIN'}:${t.id}`,
            });
            paidBani += payout.payoutBani;
          }
          settled.push({ id: t.id, userId: t.userId, status: payout.outcome });
        }

        const data: Prisma.EventUpdateInput = { status, settledAt: now, result: outcome as unknown as Prisma.InputJsonValue };
        if (opts.source === 'ADMIN' && !outcome.cancelled) {
          Object.assign(data, {
            period: 'FULL_TIME',
            homeScore: outcome.ftHome,
            awayScore: outcome.ftAway,
            htHomeScore: outcome.htHome,
            htAwayScore: outcome.htAway,
            corners: outcome.corners,
            cards: outcome.cards,
          });
        }
        const updated = await tx.event.update({ where: { id: eventId }, data });
        const version = (await tx.settlementRecord.count({ where: { eventId } })) + 1;
        await tx.settlementRecord.create({
          data: {
            eventId,
            version,
            result: outcome as unknown as Prisma.InputJsonValue,
            source: opts.source,
            adminId: opts.source === 'ADMIN' ? (opts.actor.id ?? null) : null,
            reason: opts.reason ?? null,
            ticketsSettled: settled.length,
          },
        });
        await this.audit.log(
          {
            category: opts.source === 'ADMIN' ? 'ADMIN' : 'BETTING',
            action: opts.source === 'ADMIN' ? 'EVENT_SETTLED_MANUALLY' : 'EVENT_SETTLED',
            actor: opts.actor,
            entityType: 'Event',
            entityId: eventId,
            after: { status, ftHome: outcome.ftHome, ftAway: outcome.ftAway, htHome: outcome.htHome, htAway: outcome.htAway },
            meta: {
              match: `${ev.homeTeam} – ${ev.awayTeam}`,
              version,
              ticketsSettled: settled.length,
              paidBani,
              ...(opts.reason ? { reason: opts.reason } : {}),
            },
          },
          tx,
        );
        return { eventId, status, version, ticketsSettled: settled.length, paidBani, ev: updated } as const;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    // tell everyone after commit
    const e = result.ev;
    const stateMsg: EventStateMessage = {
      type: 'event',
      eventId,
      status: e.status,
      period: e.period,
      minute: e.minute,
      homeScore: e.homeScore,
      awayScore: e.awayScore,
      corners: e.corners,
      cards: e.cards,
      suspended: true,
    };
    await this.redis.publish(Channels.EVENT_UPDATES, stateMsg);
    for (const t of settled) {
      const msg: TicketMessage = { type: 'ticket', userId: t.userId, ticketId: t.id, status: t.status };
      await this.redis.publish(Channels.TICKET_UPDATES, msg);
    }
    for (const userId of new Set(settled.map((t) => t.userId))) await this.wallet.publishBalance(userId);
    this.logger.log({ settled: eventId, version: result.version, tickets: result.ticketsSettled, paidBani: result.paidBani });

    const { ev: _ev, ...summary } = result;
    return summary;
  }

  /** Rule 6: a match that keeps failing is audited once an hour, not on every run. */
  private async reportFailure(eventId: string, e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    this.logger.error({ settlementFailed: eventId, error: message });
    const first = await this.redis.client.set(`settle:fail:${eventId}`, '1', 'EX', 3600, 'NX');
    if (first) {
      await this.audit
        .log({ category: 'SYSTEM', action: 'SETTLEMENT_FAILED', actor: SYSTEM_ACTOR, entityType: 'Event', entityId: eventId, meta: { error: message } })
        .catch(() => undefined);
    }
  }
}

/** Grades one selection; a market the rules cannot read is voided rather than blocking the match. */
function gradeSafely(spec: MarketSpec, outcome: string, r: MatchOutcome): Settled {
  try {
    return settleSelection(spec, outcome, r);
  } catch {
    return 'VOID';
  }
}

function groupBy(m: Map<string, Settled>) {
  const out = new Map<Settled, string[]>();
  for (const [id, v] of m) out.set(v, [...(out.get(v) ?? []), id]);
  return out;
}
