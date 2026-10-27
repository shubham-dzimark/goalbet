import { type Prisma } from '@goalbet/db';
import {
  type CompetitionDto,
  type ErrorCode,
  type EventDetailDto,
  type EventSummaryDto,
  type MarketDto,
  type SelectionDto,
  parseLineCenti,
  parseOddsMilli,
} from '@goalbet/shared';

export const selectionInclude = { boost: true } satisfies Prisma.SelectionInclude;

export const marketInclude = {
  selections: { orderBy: { sortOrder: 'asc' }, include: selectionInclude },
} satisfies Prisma.MarketInclude;

type SelectionRow = Prisma.SelectionGetPayload<{ include: typeof selectionInclude }>;
type MarketRow = Prisma.MarketGetPayload<{ include: typeof marketInclude }>;
type CompetitionRow = Pick<Prisma.CompetitionGetPayload<object>, 'id' | 'name' | 'country' | 'countryCode' | 'isTop'>;

export function boostActive(b: SelectionRow['boost'], now = Date.now()): b is NonNullable<SelectionRow['boost']> {
  return !!b && b.active && (!b.expiresAt || b.expiresAt.getTime() > now);
}

/**
 * The price a player gets for a selection right now: the provider price, or the operator boost
 * when it is active and better. The bet engine uses the same function, so the UI never shows a
 * price the backend would not honour.
 */
export function effectiveOddsMilli(s: SelectionRow, now = Date.now()): number {
  const base = parseOddsMilli(s.odds);
  return boostActive(s.boost, now) ? Math.max(base, parseOddsMilli(s.boost.odds)) : base;
}

/** A selection with its market, event and league: enough to tell whether it can be bet on now. */
export type BettableSelection = SelectionRow & {
  market: Prisma.MarketGetPayload<object> & { event: Prisma.EventGetPayload<object> & { competition: { enabled: boolean; active: boolean } } };
};

/**
 * F1.13 step 2 for one selection, in flow-chart order: the first reason it can't be bet on now,
 * or null. Shared by bet validation, the Bet Builder quote and the slip refresh.
 */
export function selectionBlock(s: BettableSelection, disabledTypes: ReadonlySet<string>, now = Date.now()): ErrorCode | null {
  const { market } = s;
  const { event } = market;
  if (!event.competition.enabled || !event.competition.active) return 'LEAGUE_DISABLED';
  const open = event.status === 'LIVE' || (event.status === 'SCHEDULED' && event.startTime.getTime() > now);
  if (!open) return 'EVENT_NOT_AVAILABLE';
  if (event.suspended || event.feedSuspended) return 'EVENT_SUSPENDED';
  if (!market.enabled || market.status === 'SETTLED' || disabledTypes.has(market.type)) return 'MARKET_CLOSED';
  if (market.status !== 'OPEN' || !s.active) return 'MARKET_SUSPENDED';
  return null;
}

export function toSelection(s: SelectionRow): SelectionDto {
  const base = parseOddsMilli(s.odds);
  const odds = effectiveOddsMilli(s);
  return {
    id: s.id,
    outcome: s.outcome,
    label: s.label,
    team: s.team,
    oddsMilli: odds,
    baseOddsMilli: odds !== base ? base : null,
    boosted: odds !== base,
    active: s.active,
  };
}

export function toMarket(m: MarketRow): MarketDto {
  return {
    id: m.id,
    key: m.key,
    type: m.type,
    period: m.period,
    line: parseLineCenti(m.line),
    team: m.team,
    playerName: m.playerName,
    status: m.status,
    selections: m.selections.map(toSelection),
  };
}

export const toCompetition = (c: CompetitionRow): CompetitionDto => ({
  id: c.id,
  name: c.name,
  country: c.country,
  countryCode: c.countryCode,
  isTop: c.isTop,
});

export interface SummaryRow {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startTime: Date;
  status: EventSummaryDto['status'];
  period: EventSummaryDto['period'];
  minute: number | null;
  homeScore: number;
  awayScore: number;
  suspended: boolean;
  feedSuspended: boolean;
  isTop: boolean;
  competition: CompetitionRow;
  markets: MarketRow[];
  _count: { markets: number };
}

export function toSummary(e: SummaryRow): EventSummaryDto {
  const main = e.markets.find((m) => m.type === 'MATCH_RESULT' && m.period === 'FT') ?? null;
  return {
    id: e.id,
    competition: toCompetition(e.competition),
    homeTeam: e.homeTeam,
    awayTeam: e.awayTeam,
    startTime: e.startTime.toISOString(),
    status: e.status,
    period: e.period,
    minute: e.minute,
    homeScore: e.homeScore,
    awayScore: e.awayScore,
    suspended: e.suspended || e.feedSuspended,
    isTop: e.isTop,
    marketCount: e._count.markets,
    mainMarket: main ? toMarket(main) : null,
  };
}

export function toDetail(
  e: SummaryRow & { htHomeScore: number | null; htAwayScore: number | null; corners: number; cards: number },
): EventDetailDto {
  return {
    ...toSummary(e),
    htHomeScore: e.htHomeScore,
    htAwayScore: e.htAwayScore,
    corners: e.corners,
    cards: e.cards,
    markets: e.markets.map(toMarket),
  };
}
