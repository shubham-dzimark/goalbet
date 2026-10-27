import { Inject, Injectable } from '@nestjs/common';
import {
  BET_BUILDER_MIN_ODDS_MILLI,
  type BuilderError,
  type BuilderSelection,
  type MarketSpec,
  fallbackBuilderOdds,
  parseLineCenti,
  validateBuilder,
} from '@goalbet/shared';
import { DomainError } from '../../common/errors.js';
import { SettingsService } from '../../common/settings.service.js';
import { ODDS_PROVIDER, type OddsProvider } from '../api-integration/odds-provider.js';
import { type BettableSelection, effectiveOddsMilli } from './catalog.mappers.js';

export type BuilderReason = BuilderError | 'ONE_MATCH';

export interface BuilderPrice {
  oddsMilli: number;
  /** PROVIDER = correlated price from the feed; MODEL = product of odds × correlation factor */
  source: 'PROVIDER' | 'MODEL';
  /** current price of each part, in input order (what each selection is worth on its own) */
  partOddsMilli: number[];
}

/**
 * F1.11 Bet Builder pricing. Several selections on one match form a single leg with one
 * correlated price: the provider's price when it can price the combination, otherwise the
 * product of the selection prices × `builder.factorBps` (default 0.85), never below 1.01.
 * Contradictions (e.g. Home win + Away win) are refused by the shared rules, which are the same
 * rules settlement uses.
 */
@Injectable()
export class BuilderPricingService {
  constructor(
    private readonly settings: SettingsService,
    @Inject(ODDS_PROVIDER) private readonly provider: OddsProvider,
  ) {}

  /** Throws BUILDER_INVALID { reason } when the combination can't be priced. */
  async price(eventId: string, selections: BettableSelection[], now = Date.now()): Promise<BuilderPrice> {
    const reason = this.check(eventId, selections, now);
    if (reason) throw new DomainError('BUILDER_INVALID', { reason, eventId });
    const partOddsMilli = selections.map((s) => effectiveOddsMilli(s, now));
    const event = selections[0]!.market.event;
    const priced = await this.provider
      .priceBetBuilder?.(
        event.providerRef,
        selections.map((s) => ({ marketKey: s.market.key, outcome: s.outcome })),
      )
      .catch(() => null);
    if (priced) return { oddsMilli: Math.max(BET_BUILDER_MIN_ODDS_MILLI, priced), source: 'PROVIDER', partOddsMilli };
    const factor = await this.settings.get('builder.factorBps');
    return { oddsMilli: fallbackBuilderOdds(partOddsMilli, factor), source: 'MODEL', partOddsMilli };
  }

  check(eventId: string, selections: BettableSelection[], now = Date.now()): BuilderReason | null {
    if (selections.some((s) => s.market.eventId !== eventId)) return 'ONE_MATCH';
    const parts: BuilderSelection[] = selections.map((s) => ({
      market: specOf(s.market),
      outcome: s.outcome,
      oddsMilli: effectiveOddsMilli(s, now),
      playerTeam: s.team,
    }));
    return validateBuilder(parts);
  }
}

export const specOf = (m: BettableSelection['market']): MarketSpec => ({
  type: m.type,
  period: m.period,
  line: parseLineCenti(m.line),
  team: m.team,
  playerRef: m.playerRef,
});
