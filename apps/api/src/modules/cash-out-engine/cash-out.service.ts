import { setTimeout as sleep } from 'node:timers/promises';
import { Injectable } from '@nestjs/common';
import { type Tx } from '@goalbet/db';
import {
  type CashOutLeg,
  type CashOutQuoteDto,
  type CashOutUnavailableReason,
  OPEN_TICKET_STATUSES,
  type TicketDto,
  type TicketMessage,
  isCashOutWithinTolerance,
  parseOddsMilli,
  quoteCashOut,
} from '@goalbet/shared';
import { type Actor, AuditService } from '../../common/audit.service.js';
import { DomainError } from '../../common/errors.js';
import { IdempotencyService } from '../../common/idempotency.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { Channels, RedisService } from '../../common/redis.service.js';
import { SettingsService } from '../../common/settings.service.js';
import { ticketInclude, toTicketDto } from '../bet-processing/ticket.mapper.js';
import { BuilderPricingService } from '../odds-management/builder-pricing.service.js';
import { effectiveOddsMilli, selectionInclude } from '../odds-management/catalog.mappers.js';
import { WalletService } from '../wallet-ledger/wallet.service.js';

const quoteInclude = {
  legs: {
    include: {
      event: { select: { status: true, startTime: true, suspended: true, feedSuspended: true, competition: { select: { enabled: true, active: true } } } },
      selections: {
        include: { selection: { include: { ...selectionInclude, market: { include: { event: { include: { competition: { select: { enabled: true, active: true } } } } } } } } },
      },
    },
  },
} as const;

type Db = Tx | PrismaService;
type Quote =
  | { available: true; offerBani: number }
  | { available: false; reason: CashOutUnavailableReason | 'DISABLED' | 'NOT_OPEN' };

/**
 * F4.2 CashOutEngine (F2.3–F2.7). The offer is the fallback formula from packages/shared
 * (placed ÷ current odds, less the margin) on the prices a player could bet right now.
 * Accepting re-computes it inside the transaction with the ticket row locked: within 1 % of
 * what the player saw it is paid (CASHOUT credit, `CASHOUT:<ticket>`), otherwise the new
 * offer is returned for confirmation.
 */
@Injectable()
export class CashOutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
    private readonly idempotency: IdempotencyService,
    private readonly builder: BuilderPricingService,
  ) {}

  /** F2.3 current offer for one of the player's tickets. */
  async quote(userId: string, ticketId: string): Promise<CashOutQuoteDto> {
    const owner = await this.prisma.ticket.findFirst({ where: { id: ticketId, userId }, select: { id: true } });
    if (!owner) throw new DomainError('NOT_FOUND');
    return { ticketId, quotedAt: new Date().toISOString(), ...(await this.compute(this.prisma, ticketId)) };
  }

  /** Offers for all of a player's open tickets (My Bets list). */
  async quotes(userId: string): Promise<CashOutQuoteDto[]> {
    const open = await this.prisma.ticket.findMany({ where: { userId, status: { in: OPEN_TICKET_STATUSES } }, select: { id: true }, take: 100 });
    const quotedAt = new Date().toISOString();
    return Promise.all(open.map(async (t) => ({ ticketId: t.id, quotedAt, ...(await this.compute(this.prisma, t.id)) })));
  }

  /** F2.5–F2.7 accept: Idempotency-Key required; live tickets wait the bet delay first (as live bets do). */
  async accept(userId: string, ticketId: string, idempotencyKey: string | undefined, offerBani: number, actor: Actor): Promise<TicketDto> {
    const key = IdempotencyService.requireKey(idempotencyKey);
    const { result } = await this.idempotency.run('cashout', userId, key, { ticketId, offerBani }, () =>
      this.acceptOnce(userId, ticketId, offerBani, actor),
    );
    return result;
  }

  private async acceptOnce(userId: string, ticketId: string, offerBani: number, actor: Actor): Promise<TicketDto> {
    const t = await this.prisma.ticket.findFirst({ where: { id: ticketId, userId }, select: { status: true } });
    if (!t) throw new DomainError('NOT_FOUND');
    if (!OPEN_TICKET_STATUSES.includes(t.status)) throw new DomainError('TICKET_NOT_OPEN');
    if (t.status === 'LIVE') {
      const delay = await this.settings.get('betting.liveDelayMs');
      if (delay > 0) await sleep(delay);
    }

    await this.prisma.$transaction(async (tx) => {
      // the ticket row lock serialises cash out against settlement and a double click
      const rows = await tx.$queryRaw<{ status: string; code: string; stakeBani: number }[]>`
        SELECT status, code, "stakeBani" FROM "Ticket" WHERE id = ${ticketId}::uuid FOR UPDATE`;
      const row = rows[0];
      if (!row) throw new DomainError('NOT_FOUND');
      if (!(OPEN_TICKET_STATUSES as string[]).includes(row.status)) throw new DomainError('TICKET_NOT_OPEN');

      const q = await this.compute(tx, ticketId);
      if (!q.available) throw new DomainError('CASHOUT_UNAVAILABLE', { reason: q.reason });
      // F2.6: the price moved more than the tolerance below what the player accepted
      if (!isCashOutWithinTolerance(offerBani, q.offerBani)) throw new DomainError('CASHOUT_PRICE_CHANGED', { offerBani: q.offerBani });

      const now = new Date();
      await tx.ticket.update({ where: { id: ticketId }, data: { status: 'CASHED_OUT', cashedOutBani: q.offerBani, cashedOutAt: now, settledAt: now } });
      await this.wallet.apply(tx, {
        userId,
        type: 'CASHOUT',
        amountBani: q.offerBani,
        reason: `Cash out ${row.code}`,
        actor,
        ticketId,
        uniqueRef: `CASHOUT:${ticketId}`,
      });
      await this.audit.log(
        {
          category: 'BETTING',
          action: 'TICKET_CASHED_OUT',
          actor,
          entityType: 'Ticket',
          entityId: ticketId,
          before: { status: row.status },
          after: { status: 'CASHED_OUT', cashedOutBani: q.offerBani },
          meta: { code: row.code, stakeBani: row.stakeBani, shownBani: offerBani },
        },
        tx,
      );
    });

    const msg: TicketMessage = { type: 'ticket', userId, ticketId, status: 'CASHED_OUT', cashOut: { available: false, reason: 'NOT_OPEN' } };
    await this.redis.publish(Channels.TICKET_UPDATES, msg);
    await this.wallet.publishBalance(userId);
    return toTicketDto(await this.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: ticketInclude }));
  }

  private async compute(db: Db, ticketId: string): Promise<Quote> {
    if (!(await this.settings.get('cashout.enabled'))) return { available: false, reason: 'DISABLED' };
    const t = await db.ticket.findUnique({ where: { id: ticketId }, include: quoteInclude });
    if (!t || !OPEN_TICKET_STATUSES.includes(t.status)) return { available: false, reason: 'NOT_OPEN' };

    const now = Date.now();
    const legs: CashOutLeg[] = [];
    for (const l of t.legs) {
      const ev = l.event;
      const sels = l.selections.map((s) => s.selection);
      const suspended =
        ev.suspended ||
        ev.feedSuspended ||
        !ev.competition.enabled ||
        !ev.competition.active ||
        // only bettable matches have a price: live, or not kicked off yet (a match the feed never started is not)
        !(ev.status === 'LIVE' || (ev.status === 'SCHEDULED' && ev.startTime.getTime() > now)) ||
        sels.some((s) => s.market.status !== 'OPEN' || !s.market.enabled || s.market.adminSuspended || !s.active);
      // a Bet Builder leg is re-priced as a whole, like when it was placed
      let current: number | null = null;
      if (l.kind === 'SELECTION' && sels[0]) current = effectiveOddsMilli(sels[0], now);
      else if (l.status === 'PENDING' && !suspended) current = (await this.builder.price(l.eventId, sels, now).catch(() => null))?.oddsMilli ?? null;
      legs.push({ placedOddsMilli: parseOddsMilli(l.oddsAtPlacement), currentOddsMilli: current, status: l.status, suspended });
    }
    return quoteCashOut({
      stakeBani: t.stakeBani,
      potentialWinBani: t.potentialWinBani,
      legs,
      marginBps: await this.settings.get('cashout.marginBps'),
    });
  }
}
