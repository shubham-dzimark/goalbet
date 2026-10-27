import { setTimeout as sleep } from 'node:timers/promises';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@goalbet/db';
import { type PlaceBetInput, type TicketDto, oddsToDecimalString } from '@goalbet/shared';
import { type Actor, AuditService } from '../../common/audit.service.js';
import { ticketCode } from '../../common/auth/crypto.js';
import { DomainError } from '../../common/errors.js';
import { IdempotencyService } from '../../common/idempotency.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { SettingsService } from '../../common/settings.service.js';
import { WalletService } from '../wallet-ledger/wallet.service.js';
import { BetValidationService, type ValidatedBet, legSelections } from './bet-validation.service.js';
import { ticketInclude, toTicketDto } from './ticket.mapper.js';

type Input = Required<Pick<PlaceBetInput, 'type' | 'stakeBani' | 'legs'>> & {
  oddsChangePreference: 'NONE' | 'HIGHER' | 'ANY';
};

/**
 * F1.13 → F1.14 / F1.15. Validation failures are typed rejections: no ticket, no money moved,
 * and the attempt is recorded as betting activity. Success deducts the stake (STAKE) and creates
 * the ticket in one transaction with the wallet row locked.
 */
@Injectable()
export class BetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: BetValidationService,
    private readonly wallet: WalletService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async place(userId: string, idempotencyKey: string | undefined, input: Input, actor: Actor): Promise<TicketDto> {
    const key = IdempotencyService.requireKey(idempotencyKey);
    const { result } = await this.idempotency.run('bets', userId, key, input, async () => {
      try {
        return await this.placeOnce(userId, key, input, actor);
      } catch (e) {
        if (e instanceof DomainError) await this.recordRejection(userId, input, e, actor);
        throw e;
      }
    });
    return result;
  }

  private async placeOnce(userId: string, key: string, input: Input, actor: Actor): Promise<TicketDto> {
    let bet = await this.validation.validate(userId, input);

    // F1.15 live bets: wait the configured bet delay, then re-validate against fresh prices.
    if (bet.isLive) {
      const delay = await this.settings.get('betting.liveDelayMs');
      if (delay > 0) await sleep(delay);
      bet = await this.validation.validate(userId, input);
    }

    const ticketId = await this.prisma.$transaction(async (tx) => {
      const ticket = await this.createTicket(tx, userId, key, bet);
      // Wallet row lock + balance re-check happen inside apply (rule 4).
      await this.wallet.apply(tx, {
        userId,
        type: 'STAKE',
        amountBani: -bet.stakeBani,
        reason: `Stake ${ticket.code}`,
        actor,
        ticketId: ticket.id,
        uniqueRef: `STAKE:${ticket.id}`,
      });
      await this.audit.log(
        {
          category: 'BETTING',
          action: 'BET_PLACED',
          actor,
          entityType: 'Ticket',
          entityId: ticket.id,
          after: {
            code: ticket.code,
            type: bet.type,
            status: ticket.status,
            stakeBani: bet.stakeBani,
            totalOddsMilli: bet.totalOddsMilli,
            potentialWinBani: bet.potentialWinBani,
            legs: bet.legs.map((l) => ({ kind: l.kind, selectionIds: legSelections(l).map((x) => x.id), oddsMilli: l.oddsMilli })),
          },
        },
        tx,
      );
      return ticket.id;
    });

    await this.wallet.publishBalance(userId);
    const row = await this.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: ticketInclude });
    return toTicketDto(row);
  }

  private async createTicket(tx: Prisma.TransactionClient, userId: string, key: string, bet: ValidatedBet) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await tx.ticket.create({
          data: {
            code: ticketCode(),
            userId,
            type: bet.type,
            // Active for pre-match; Live when any event has already started (F1.15 / F2.1).
            status: bet.isLive ? 'LIVE' : 'ACTIVE',
            stakeBani: bet.stakeBani,
            totalOdds: oddsToDecimalString(bet.totalOddsMilli),
            potentialWinBani: bet.potentialWinBani,
            isLive: bet.isLive,
            oddsChangePreference: bet.oddsChangePreference,
            idempotencyKey: key,
            legs: {
              create: bet.legs.map((l, i) => ({
                eventId: l.eventId,
                kind: l.kind,
                oddsAtPlacement: oddsToDecimalString(l.oddsMilli),
                sortOrder: i,
                selections: {
                  create:
                    l.kind === 'SELECTION'
                      ? [{ selectionId: l.selection.id, oddsAtPlacement: oddsToDecimalString(l.oddsMilli) }]
                      : l.selections.map((x, j) => ({ selectionId: x.id, oddsAtPlacement: oddsToDecimalString(l.partOddsMilli[j]!) })),
                },
              })),
            },
          },
        });
      } catch (e) {
        // ticket code collision → retry with a new code
        const target = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ? String(e.meta?.['target'] ?? '') : '';
        if (!target.includes('code')) throw e;
      }
    }
    throw new DomainError('INTERNAL');
  }

  /** F1.14 — log the rejected attempt as betting activity. */
  private async recordRejection(userId: string, input: Input, err: DomainError, actor: Actor) {
    const details = (err.details ?? null) as Prisma.InputJsonValue | null;
    await this.prisma.betAttempt
      .create({
        data: {
          userId,
          code: err.code,
          payload: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue,
          details: details ?? Prisma.JsonNull,
          ip: actor.ip ?? null,
        },
      })
      .catch(() => undefined);
    await this.audit
      .log({
        category: 'BETTING',
        action: 'BET_REJECTED',
        actor,
        entityType: 'User',
        entityId: userId,
        meta: { code: err.code, details: err.details ?? null, stakeBani: input.stakeBani, legs: input.legs.length },
      })
      .catch(() => undefined);
  }
}
