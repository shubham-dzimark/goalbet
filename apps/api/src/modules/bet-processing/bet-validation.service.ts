import { Injectable } from '@nestjs/common';
import { type Prisma, type UserLimit } from '@goalbet/db';
import { type PlaceBetInput, type Settings, combineOdds, potentialWin } from '@goalbet/shared';
import { DomainError } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { SettingsService } from '../../common/settings.service.js';
import { effectiveOddsMilli, selectionInclude } from '../odds-management/catalog.mappers.js';

const DAY = 86_400_000;

const selectionForBet = {
  ...selectionInclude,
  market: { include: { event: { include: { competition: true } } } },
} satisfies Prisma.SelectionInclude;

type SelectionForBet = Prisma.SelectionGetPayload<{ include: typeof selectionForBet }>;

export interface ValidatedLeg {
  kind: 'SELECTION';
  eventId: string;
  selection: SelectionForBet;
  oddsMilli: number;
}

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

/** Effective value of a limit right now (increases and removals wait for their cooling-off time). */
export function effectiveLimit(l: UserLimit, now = Date.now()): number | null {
  if (l.pendingAmountBani !== null && l.effectiveAt.getTime() <= now) return l.pendingAmountBani === 0 ? null : l.pendingAmountBani;
  return l.amountBani;
}

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

    // request shape: single = 1 leg, accumulator = 2..max legs, one selection per match
    if (input.legs.some((l) => l.kind !== 'SELECTION')) throw new DomainError('BUILDER_INVALID');
    if (input.type === 'SINGLE' && input.legs.length !== 1) throw new DomainError('VALIDATION_FAILED', { reason: 'single_needs_one_leg' });
    if (input.type === 'ACCA' && (input.legs.length < 2 || input.legs.length > settings['betting.maxAccaLegs'])) {
      throw new DomainError('VALIDATION_FAILED', { reason: 'acca_legs', max: settings['betting.maxAccaLegs'] });
    }
    const legsIn = input.legs as Extract<PlaceBetInput['legs'][number], { kind: 'SELECTION' }>[];
    const selections = await this.prisma.selection.findMany({
      where: { id: { in: legsIn.map((l) => l.selectionId) } },
      include: selectionForBet,
    });
    const byId = new Map(selections.map((s) => [s.id, s]));

    // ── 2. market status ──
    const disabledTypes = new Set(
      (await this.prisma.marketTypeSetting.findMany({ where: { enabled: false } })).map((t) => t.type),
    );
    const now = Date.now();
    const seenEvents = new Set<string>();
    for (const l of legsIn) {
      const s = byId.get(l.selectionId);
      if (!s) throw new DomainError('SELECTION_NOT_FOUND', { selectionId: l.selectionId });
      const { market } = s;
      const { event } = market;
      if (seenEvents.has(event.id)) throw new DomainError('DUPLICATE_EVENT', { eventId: event.id });
      seenEvents.add(event.id);
      if (!event.competition.enabled || !event.competition.active) throw new DomainError('LEAGUE_DISABLED', { selectionId: s.id });
      const open = event.status === 'LIVE' || (event.status === 'SCHEDULED' && event.startTime.getTime() > now);
      if (!open) throw new DomainError('EVENT_NOT_AVAILABLE', { selectionId: s.id, eventId: event.id });
      if (event.suspended || event.feedSuspended) throw new DomainError('EVENT_SUSPENDED', { selectionId: s.id, eventId: event.id });
      if (!market.enabled || market.status === 'SETTLED' || disabledTypes.has(market.type)) {
        throw new DomainError('MARKET_CLOSED', { selectionId: s.id });
      }
      if (market.status !== 'OPEN' || !s.active) throw new DomainError('MARKET_SUSPENDED', { selectionId: s.id });
    }

    // ── 3. latest odds vs submitted odds ──
    const legs: ValidatedLeg[] = legsIn.map((l) => {
      const s = byId.get(l.selectionId)!;
      return { kind: 'SELECTION', eventId: s.market.eventId, selection: s, oddsMilli: effectiveOddsMilli(s) };
    });
    const changes = legsIn
      .map((l, i) => ({ selectionId: l.selectionId, submittedOddsMilli: l.oddsMilli, currentOddsMilli: legs[i]!.oddsMilli }))
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
    if (user.wallet.balanceBani < input.stakeBani) {
      throw new DomainError('INSUFFICIENT_BALANCE', { balanceBani: user.wallet.balanceBani, stakeBani: input.stakeBani });
    }

    return {
      type: input.type,
      stakeBani: input.stakeBani,
      legs,
      totalOddsMilli,
      potentialWinBani: win,
      isLive: legs.some((l) => l.selection.market.event.status === 'LIVE'),
      oddsChangePreference: input.oddsChangePreference,
    };
  }

  private async checkLimits(userId: string, limits: UserLimit[], stake: number, win: number, s: Settings) {
    if (stake < s['betting.minStakeBani']) throw new DomainError('STAKE_TOO_LOW', { minBani: s['betting.minStakeBani'] });
    if (stake > s['betting.maxStakeBani']) throw new DomainError('STAKE_TOO_HIGH', { maxBani: s['betting.maxStakeBani'] });
    if (win > s['betting.maxPayoutBani']) throw new DomainError('MAX_PAYOUT_EXCEEDED', { maxBani: s['betting.maxPayoutBani'] });

    // Player self-limits and admin-set per-user limits: the strictest of each type applies.
    const strictest = new Map<string, number>();
    for (const l of limits) {
      const v = effectiveLimit(l);
      if (v === null) continue;
      strictest.set(l.type, Math.min(v, strictest.get(l.type) ?? Number.MAX_SAFE_INTEGER));
    }
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
