import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Prisma, type Tx } from '@goalbet/db';
import {
  type AdminEventPlayer,
  type AdminResettlementResult,
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
      select: { id: true, providerRef: true, status: true, startTime: true },
      orderBy: { startTime: 'asc' },
      take: limit,
    });
    let settled = 0;
    let waiting = 0;
    let failed = 0;
    for (const ev of events) {
      const result = await this.provider.getResult(ev.providerRef, ev.startTime).catch(() => null);
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
    const ev = await this.prisma.event.findUnique({ where: { id: eventId }, select: { startTime: true, settledAt: true, players: true } });
    if (!ev) throw new DomainError('NOT_FOUND');
    if (ev.settledAt) throw new DomainError('EVENT_ALREADY_SETTLED');
    // a match can be called off before kick-off, but only played matches have a result
    if (!input.cancelled && ev.startTime.getTime() > Date.now()) throw new DomainError('SETTLEMENT_NOT_READY');
    return this.settleEvent(eventId, { outcome: manualOutcome(input, ev.players), source: 'ADMIN', actor, reason: input.reason });
  }

  /** Squad players with player markets on the match (for entering scorers), open bets first. */
  async eventPlayers(eventId: string): Promise<AdminEventPlayer[]> {
    const ev = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        players: true,
        markets: {
          where: { type: { in: ['ANYTIME_SCORER', 'PLAYER_SHOTS'] } },
          select: {
            type: true,
            playerRef: true,
            selections: {
              select: {
                outcome: true,
                _count: { select: { legSelections: { where: { leg: { ticket: { status: { in: OPEN_TICKET_STATUSES } } } } } } },
              },
            },
          },
        },
      },
    });
    if (!ev) throw new DomainError('NOT_FOUND');
    const bets = new Map<string, number>();
    for (const m of ev.markets) {
      for (const sel of m.selections) {
        // scorer outcomes are player refs; shots markets carry the player on the market
        const ref = m.type === 'ANYTIME_SCORER' ? sel.outcome : m.playerRef;
        if (ref) bets.set(ref, (bets.get(ref) ?? 0) + sel._count.legSelections);
      }
    }
    return squad(ev.players)
      .filter((pl) => bets.has(pl.ref))
      .map((pl) => ({ ...pl, openBets: bets.get(pl.ref) ?? 0 }))
      .sort((a, b) => b.openBets - a.openBets || (a.team === b.team ? 0 : a.team === 'HOME' ? -1 : 1) || a.name.localeCompare(b.name));
  }

  /**
   * F2.9 re-settlement: an operator corrects the result of a settled match. Every selection and
   * leg is graded again and each affected ticket gets the difference: more winnings are credited,
   * winnings no longer due are taken back (VOID_REVERSAL), and a ticket reopens when a leg is no
   * longer lost. One transaction: if a player no longer has the money to take back, nothing
   * changes and those players are listed. Cashed-out tickets are never touched.
   */
  async resettle(actor: Actor, eventId: string, input: AdminSettleEventInput): Promise<AdminResettlementResult> {
    const changed: { id: string; userId: string; status: TicketMessage['status'] }[] = [];
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId}::uuid FOR UPDATE`;
        const ev = await tx.event.findUnique({ where: { id: eventId }, include: { markets: { include: { selections: true } } } });
        if (!ev) throw new DomainError('NOT_FOUND');
        if (!ev.settledAt) throw new DomainError('EVENT_NOT_SETTLED');
        const now = new Date();
        const outcome = manualOutcome(input, ev.players);
        const version = (await tx.settlementRecord.count({ where: { eventId } })) + 1;
        const legs = await this.gradeEvent(tx, ev, outcome, now, false);

        const tickets = await tx.ticket.findMany({
          where: { id: { in: [...new Set(legs.map((l) => l.ticketId))] }, status: { notIn: ['CASHED_OUT', 'REJECTED'] } },
          select: {
            id: true,
            code: true,
            userId: true,
            status: true,
            stakeBani: true,
            payoutBani: true,
            legs: { select: { oddsAtPlacement: true, status: true, event: { select: { status: true } } } },
          },
          orderBy: [{ userId: 'asc' }, { id: 'asc' }],
        });
        let creditedBani = 0;
        let debitedBani = 0;
        const shortfalls: { userId: string; ticket: string; amountBani: number }[] = [];
        const changes: { ticket: string; from: string; to: string; deltaBani: number }[] = [];
        for (const t of tickets) {
          const wasSettled = t.status === 'WON' || t.status === 'LOST' || t.status === 'VOID';
          const oldPayout = wasSettled ? (t.payoutBani ?? 0) : 0;
          const decided = t.legs.some((l) => l.status === 'LOST') || t.legs.every((l) => l.status !== 'PENDING');
          const payout = decided
            ? settleTicketPayout(t.stakeBani, t.legs.map((l) => ({ oddsMilli: parseOddsMilli(l.oddsAtPlacement), status: l.status })))
            : null;
          const newStatus = payout ? payout.outcome : t.legs.some((l) => l.event.status === 'LIVE') ? 'LIVE' : 'ACTIVE';
          const newPayout = payout?.payoutBani ?? 0;
          if (newStatus === t.status && newPayout === oldPayout) continue;
          const delta = newPayout - oldPayout;
          if (delta !== 0) {
            try {
              await this.wallet.apply(tx, {
                userId: t.userId,
                type: delta < 0 ? 'VOID_REVERSAL' : newStatus === 'VOID' ? 'REFUND' : 'WIN',
                amountBani: delta,
                reason: `Re-settlement v${version} ${t.code}`,
                actor,
                ticketId: t.id,
                uniqueRef: `RESETTLE:${t.id}:v${version}`,
              });
            } catch (e) {
              if (!(e instanceof DomainError) || e.code !== 'NEGATIVE_BALANCE') throw e;
              shortfalls.push({ userId: t.userId, ticket: t.code, amountBani: -delta });
              continue;
            }
            if (delta > 0) creditedBani += delta;
            else debitedBani -= delta;
          }
          await tx.ticket.update({
            where: { id: t.id },
            data: { status: newStatus, payoutBani: payout ? newPayout : null, settledAt: payout ? now : null },
          });
          changed.push({ id: t.id, userId: t.userId, status: newStatus });
          changes.push({ ticket: t.code, from: t.status, to: newStatus, deltaBani: delta });
        }
        // all or nothing: a correction that can't be taken back in full changes nothing
        if (shortfalls.length) throw new DomainError('RESETTLE_INSUFFICIENT_FUNDS', { players: shortfalls });

        const updated = await tx.event.update({ where: { id: eventId }, data: { ...eventResultData(outcome), settledAt: now } });
        await tx.settlementRecord.create({
          data: {
            eventId,
            version,
            result: outcome as unknown as Prisma.InputJsonValue,
            source: 'ADMIN_RESETTLE',
            adminId: actor.id ?? null,
            reason: input.reason,
            ticketsSettled: changed.length,
          },
        });
        await this.audit.log(
          {
            category: 'ADMIN',
            action: 'EVENT_RESETTLED',
            actor,
            entityType: 'Event',
            entityId: eventId,
            before: ev.result ?? null,
            after: { cancelled: !!outcome.cancelled, ftHome: outcome.ftHome, ftAway: outcome.ftAway, htHome: outcome.htHome, htAway: outcome.htAway },
            meta: { match: `${ev.homeTeam} – ${ev.awayTeam}`, version, reason: input.reason, creditedBani, debitedBani, changes },
          },
          tx,
        );
        return { eventId, version, ticketsChanged: changed.length, creditedBani, debitedBani, ev: updated } as const;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    await this.publishAfter(result.ev, changed);
    this.logger.log({ resettled: eventId, version: result.version, tickets: result.ticketsChanged });
    const { ev: _ev, ...summary } = result;
    return summary;
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

        const legs = await this.gradeEvent(tx, ev, outcome, now, true);

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

        const data: Prisma.EventUpdateInput =
          opts.source === 'ADMIN' ? eventResultData(outcome) : { status, result: outcome as unknown as Prisma.InputJsonValue };
        const updated = await tx.event.update({ where: { id: eventId }, data: { ...data, settledAt: now } });
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

    await this.publishAfter(result.ev, settled);
    this.logger.log({ settled: eventId, version: result.version, tickets: result.ticketsSettled, paidBani: result.paidBani });

    const { ev: _ev, ...summary } = result;
    return summary;
  }

  /**
   * F2.9 grades every selection of the match, then its ticket legs (only the open ones on first
   * settlement, all of them on a re-settlement). Returns the legs it graded.
   */
  private async gradeEvent(
    tx: Tx,
    ev: Prisma.EventGetPayload<{ include: { markets: { include: { selections: true } } } }>,
    outcome: MatchOutcome,
    now: Date,
    pendingOnly: boolean,
  ) {
    const results = new Map<string, Settled>();
    for (const m of ev.markets) {
      const spec: MarketSpec = { type: m.type, period: m.period, line: parseLineCenti(m.line), team: m.team, playerRef: m.playerRef };
      for (const sel of m.selections) results.set(sel.id, gradeSafely(spec, sel.outcome, outcome));
    }
    for (const [value, ids] of groupBy(results)) {
      await tx.selection.updateMany({ where: { id: { in: ids } }, data: { result: value } });
      await tx.ticketLegSelection.updateMany({ where: { selectionId: { in: ids } }, data: { result: value } });
    }
    await tx.market.updateMany({ where: { eventId: ev.id }, data: { status: 'SETTLED' } });

    const legs = await tx.ticketLeg.findMany({
      where: { eventId: ev.id, ...(pendingOnly ? { status: 'PENDING' as const } : {}) },
      select: { id: true, ticketId: true, kind: true, selections: { select: { selectionId: true } } },
    });
    const legResults = new Map<string, Settled>();
    for (const leg of legs) {
      const parts = leg.selections.map((x) => results.get(x.selectionId) ?? 'VOID');
      legResults.set(leg.id, leg.kind === 'BET_BUILDER' ? combineBuilderParts(parts) : (parts[0] ?? 'VOID'));
    }
    for (const [value, ids] of groupBy(legResults)) {
      await tx.ticketLeg.updateMany({ where: { id: { in: ids } }, data: { status: value, settledAt: now } });
    }
    return legs;
  }

  /** After commit: the match state to everyone, each changed ticket and balance to its player. */
  private async publishAfter(e: Prisma.EventGetPayload<object>, tickets: { id: string; userId: string; status: TicketMessage['status'] }[]) {
    const stateMsg: EventStateMessage = {
      type: 'event',
      eventId: e.id,
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
    for (const t of tickets) {
      const msg: TicketMessage = { type: 'ticket', userId: t.userId, ticketId: t.id, status: t.status };
      await this.redis.publish(Channels.TICKET_UPDATES, msg);
    }
    for (const userId of new Set(tickets.map((t) => t.userId))) await this.wallet.publishBalance(userId);
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

interface SquadPlayer {
  ref: string;
  name: string;
  team: 'HOME' | 'AWAY';
}
const squad = (players: Prisma.JsonValue): SquadPlayer[] => (Array.isArray(players) ? (players as unknown as SquadPlayer[]) : []);

/**
 * The result an operator entered. Listed players appeared (goals and shots as entered); players
 * left out have no stats, so their markets are void. Scorers' goals can't exceed their team's score.
 */
function manualOutcome(input: AdminSettleEventInput, squadJson: Prisma.JsonValue): MatchOutcome {
  const known = new Map(squad(squadJson).map((pl) => [pl.ref, pl]));
  const players: MatchOutcome['players'] = {};
  const goals = { HOME: 0, AWAY: 0 };
  for (const pl of input.cancelled ? [] : (input.players ?? [])) {
    const sp = known.get(pl.ref);
    if (!sp) throw new DomainError('VALIDATION_FAILED', { reason: 'unknown_player', ref: pl.ref }, 400);
    // a scorer took at least as many shots as goals
    players[pl.ref] = { appeared: true, goals: pl.goals, shots: Math.max(pl.shots, pl.goals) };
    goals[sp.team] += pl.goals;
  }
  if (goals.HOME > input.ftHome || goals.AWAY > input.ftAway) throw new DomainError('SCORER_GOALS_EXCEED_SCORE', goals);
  return {
    cancelled: !!input.cancelled,
    ftHome: input.ftHome,
    ftAway: input.ftAway,
    htHome: input.htHome,
    htAway: input.htAway,
    corners: input.corners,
    cards: input.cards,
    players,
  };
}

/** Event fields for a result entered by an operator. */
function eventResultData(outcome: MatchOutcome): Prisma.EventUpdateInput {
  const base = { status: outcome.cancelled ? ('CANCELLED' as const) : ('FINISHED' as const), result: outcome as unknown as Prisma.InputJsonValue };
  if (outcome.cancelled) return base;
  return {
    ...base,
    period: 'FULL_TIME',
    homeScore: outcome.ftHome,
    awayScore: outcome.ftAway,
    htHomeScore: outcome.htHome,
    htAwayScore: outcome.htAway,
    corners: outcome.corners,
    cards: outcome.cards,
  };
}

function groupBy(m: Map<string, Settled>) {
  const out = new Map<Settled, string[]>();
  for (const [id, v] of m) out.set(v, [...(out.get(v) ?? []), id]);
  return out;
}
