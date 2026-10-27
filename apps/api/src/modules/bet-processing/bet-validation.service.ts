import { Injectable } from '@nestjs/common';
import { type Prisma, type UserLimit } from '@goalbet/db';
import { type PlaceBetInput, type Settings, combineOdds, potentialWin } from '@goalbet/shared';
import { DomainError } from '../../common/errors.js';
import { DAY, strictestLimits } from '../../common/limits.js';
import { PrismaService } from '../../common/prisma.service.js';
import { SettingsService } from '../../common/settings.service.js';
import { BuilderPricingService } from '../odds-management/builder-pricing.service.js';
import { effectiveOddsMilli, selectionBlock, selectionInclude } from '../odds-management/catalog.mappers.js';


const selectionForBet = {
  ...selectionInclude,
  market: { include: { event: { include: { competition: true } } } },
} satisfies Prisma.SelectionInclude;

type SelectionForBet = Prisma.SelectionGetPayload<{ include: typeof selectionForBet }>;

export type ValidatedLeg =
  | { kind: 'SELECTION'; eventId: string; selection: SelectionForBet; oddsMilli: number }
  | {
      kind: 'BET_BUILDER';
      eventId: string;
      selections: SelectionForBet[];
      /** one correlated price for the whole leg (F1.11) */
      oddsMilli: number;
      /** each part's own price, kept on the ticket for display */
      partOddsMilli: number[];
    };

/** The selections of a leg (one, or several for a Bet Builder). */
export const legSelections = (l: ValidatedLeg) => (l.kind === 'SELECTION' ? [l.selection] : l.selections);

type LegIn = PlaceBetInput['legs'][number];
const legIds = (l: LegIn) => (l.kind === 'SELECTION' ? [l.selectionId] : l.selectionIds);

export interface ValidatedBet {
  type: 'SINGLE' | 'ACCA';
  stakeBani: number;
  legs: ValidatedLeg[];
  totalOddsMilli: number;
  potentialWinBani: number;
  /** At least one event has already kicked off. */
  isLive: boolean;
  oddsChangePreference: 'NONE' | 'HIGHER' | 'ANY';
}

type Input = Required<Pick<PlaceBetInput, 'type' | 'stakeBani' | 'legs'>> & {
  oddsChangePreference: 'NONE' | 'HIGHER' | 'ANY';
};


/**
 * F1.13 — validates a bet in the exact order of the flow chart:
 *   1. user active and not self-excluded
 *   2. market status (event + market open, not suspended)
 *   3. latest odds vs submitted odds (per the player's odds-change preference)
 *   4. bet limits (min/max stake, max payout, player + admin limits)
 *   5. enough balance
 * The backend decides everything: the returned bet carries the server's current odds.
 */
@Injectable()
export class BetValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly builder: BuilderPricingService,
  ) {}

  async validate(userId: string, input: Input): Promise<ValidatedBet> {
    const settings = await this.settings.all();

    // ── 1. user active and not self-excluded ──
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        wallet: true,
        limits: true,
        selfExclusions: { where: { startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] } },
      },
    });
    if (!user || user.status !== 'ACTIVE' || !user.wallet) throw new DomainError('USER_NOT_ACTIVE', undefined, 403);
    const exclusion = user.selfExclusions[0];
    if (exclusion) {
      throw new DomainError('SELF_EXCLUDED', { until: exclusion.endsAt?.toISOString() ?? null }, 403);
    }

    // request shape: single = 1 leg (a selection or a Bet Builder), accumulator = 2..max legs, one leg per match
    if (input.type === 'SINGLE' && input.legs.length !== 1) throw new DomainError('VALIDATION_FAILED', { reason: 'single_needs_one_leg' });
    if (input.type === 'ACCA' && (input.legs.length < 2 || input.legs.length > settings['betting.maxAccaLegs'])) {
      throw new DomainError('VALIDATION_FAILED', { reason: 'acca_legs', max: settings['betting.maxAccaLegs'] });
    }
    const selections = await this.prisma.selection.findMany({
      where: { id: { in: input.legs.flatMap(legIds) } },
      include: selectionForBet,
    });
    const byId = new Map(selections.map((s) => [s.id, s]));

    // ── 2. market status ──
    const disabledTypes = new Set<string>(
      (await this.prisma.marketTypeSetting.findMany({ where: { enabled: false } })).map((t) => t.type),
    );
    const now = Date.now();
    const seenEvents = new Set<string>();
    for (const l of input.legs) {
      const ids = legIds(l);
      if (l.kind === 'BET_BUILDER' && new Set(ids).size !== ids.length) throw new DomainError('BUILDER_INVALID', { reason: 'SAME_MARKET', eventId: l.eventId });
      for (const id of ids) {
        const s = byId.get(id);
        if (!s) throw new DomainError('SELECTION_NOT_FOUND', { selectionId: id });
        if (l.kind === 'BET_BUILDER' && s.market.eventId !== l.eventId) throw new DomainError('BUILDER_INVALID', { reason: 'ONE_MATCH', eventId: l.eventId });
      }
      const eventId = byId.get(ids[0]!)!.market.eventId;
      if (seenEvents.has(eventId)) throw new DomainError('DUPLICATE_EVENT', { eventId });
      seenEvents.add(eventId);
      for (const id of ids) {
        const block = selectionBlock(byId.get(id)!, disabledTypes, now);
        if (block) throw new DomainError(block, { selectionId: id, eventId });
      }
    }

    // ── 3. latest odds vs submitted odds (a Bet Builder is re-priced as one leg) ──
    const legs: ValidatedLeg[] = [];
    for (const l of input.legs) {
      if (l.kind === 'SELECTION') {
        const s = byId.get(l.selectionId)!;
        legs.push({ kind: 'SELECTION', eventId: s.market.eventId, selection: s, oddsMilli: effectiveOddsMilli(s, now) });
      } else {
        const parts = l.selectionIds.map((id) => byId.get(id)!);
        const price = await this.builder.price(l.eventId, parts, now);
        legs.push({ kind: 'BET_BUILDER', eventId: l.eventId, selections: parts, oddsMilli: price.oddsMilli, partOddsMilli: price.partOddsMilli });
      }
    }
    const changes = input.legs
      .map((l, i) => ({
        ...(l.kind === 'SELECTION' ? { selectionId: l.selectionId } : { eventId: l.eventId, builder: true }),
        submittedOddsMilli: l.oddsMilli,
        currentOddsMilli: legs[i]!.oddsMilli,
      }))
      .filter((c) => c.submittedOddsMilli !== c.currentOddsMilli);
    const rejectChange =
      input.oddsChangePreference === 'NONE'
        ? changes.length > 0
        : input.oddsChangePreference === 'HIGHER'
          ? changes.some((c) => c.currentOddsMilli < c.submittedOddsMilli)
          : false;
    if (rejectChange) throw new DomainError('ODDS_CHANGED', { changes });

    // ── 4. bet limits ──
    const totalOddsMilli = combineOdds(legs.map((l) => l.oddsMilli));
    const win = potentialWin(input.stakeBani, totalOddsMilli);
    await this.checkLimits(user.id, user.limits, input.stakeBani, win, settings);

    // ── 5. enough balance ──
    // money held for a pending withdrawal can't be staked
    const available = user.wallet.balanceBani - user.wallet.heldBani;
    if (available < input.stakeBani) {
      throw new DomainError('INSUFFICIENT_BALANCE', { balanceBani: available, stakeBani: input.stakeBani });
    }

    return {
      type: input.type,
      stakeBani: input.stakeBani,
      legs,
      totalOddsMilli,
      potentialWinBani: win,
      isLive: legs.some((l) => legSelections(l)[0]!.market.event.status === 'LIVE'),
      oddsChangePreference: input.oddsChangePreference,
    };
  }

  private async checkLimits(userId: string, limits: UserLimit[], stake: number, win: number, s: Settings) {
    if (stake < s['betting.minStakeBani']) throw new DomainError('STAKE_TOO_LOW', { minBani: s['betting.minStakeBani'] });
    if (stake > s['betting.maxStakeBani']) throw new DomainError('STAKE_TOO_HIGH', { maxBani: s['betting.maxStakeBani'] });
    if (win > s['betting.maxPayoutBani']) throw new DomainError('MAX_PAYOUT_EXCEEDED', { maxBani: s['betting.maxPayoutBani'] });

    // Player self-limits and admin-set per-user limits: the strictest of each type applies.
    const strictest = strictestLimits(limits);
    const perBet = strictest.get('MAX_STAKE_PER_BET');
    if (perBet !== undefined && stake > perBet) {
      throw new DomainError('USER_LIMIT_EXCEEDED', { limit: 'MAX_STAKE_PER_BET', maxBani: perBet });
    }
    const windows: [string, number][] = [
      ['DAILY_STAKE', DAY],
      ['WEEKLY_STAKE', 7 * DAY],
      ['MONTHLY_STAKE', 30 * DAY],
    ];
    for (const [type, span] of windows) {
      const limit = strictest.get(type);
      if (limit === undefined) continue;
      const agg = await this.prisma.ticket.aggregate({
        where: { userId, status: { not: 'REJECTED' }, placedAt: { gte: new Date(Date.now() - span) } },
        _sum: { stakeBani: true },
      });
      const used = agg._sum.stakeBani ?? 0;
      if (used + stake > limit) {
        throw new DomainError('USER_LIMIT_EXCEEDED', { limit: type, maxBani: limit, usedBani: used });
      }
    }
  }
}
