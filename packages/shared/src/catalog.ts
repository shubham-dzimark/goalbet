import type {
  EventStatus,
  LegKind,
  LegStatus,
  MarketPeriod,
  MarketStatus,
  MarketType,
  MatchPeriod,
  OddsChangePreference,
  Team,
  TicketStatus,
  TicketType,
  WalletTxType,
} from './enums.js';
import type { CashOutUnavailableReason } from './cashout.js';

/** API response shapes shared by the API and the frontends. */

export interface SelectionDto {
  id: string;
  outcome: string;
  label: string | null;
  team: Team | null;
  /** Price the player gets right now (boost included). */
  oddsMilli: number;
  /** Provider price before the boost, when boosted. */
  baseOddsMilli: number | null;
  boosted: boolean;
  active: boolean;
}

export interface MarketDto {
  id: string;
  key: string;
  type: MarketType;
  period: MarketPeriod;
  /** centi-line, e.g. 250 = 2.5 */
  line: number | null;
  team: Team | null;
  playerName: string | null;
  status: MarketStatus;
  selections: SelectionDto[];
}

export interface CompetitionDto {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  isTop: boolean;
}

export interface EventSummaryDto {
  id: string;
  competition: CompetitionDto;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  status: EventStatus;
  period: MatchPeriod;
  minute: number | null;
  homeScore: number;
  awayScore: number;
  suspended: boolean;
  isTop: boolean;
  marketCount: number;
  /** Full-time 1X2 */
  mainMarket: MarketDto | null;
}

export interface EventDetailDto extends EventSummaryDto {
  htHomeScore: number | null;
  htAwayScore: number | null;
  corners: number;
  cards: number;
  markets: MarketDto[];
}

export interface CountryGroupDto {
  country: string;
  countryCode: string;
  competitions: (CompetitionDto & { upcoming: number; live: number })[];
}

export interface BoostDto {
  event: EventSummaryDto;
  market: MarketDto;
  selection: SelectionDto;
}

export interface HomeFeedDto {
  liveCount: number;
  topLive: EventSummaryDto[];
  topMatches: EventSummaryDto[];
  boosted: BoostDto[];
  topCompetitions: (CompetitionDto & { upcoming: number })[];
}

export interface TicketLegSelectionDto {
  selectionId: string;
  marketType: MarketType;
  marketPeriod: MarketPeriod;
  line: number | null;
  team: Team | null;
  playerName: string | null;
  outcome: string;
  label: string | null;
  oddsMilli: number;
  result: LegStatus;
}

export interface TicketLegDto {
  id: string;
  kind: LegKind;
  oddsMilli: number;
  status: LegStatus;
  event: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    startTime: string;
    status: EventStatus;
    minute: number | null;
    homeScore: number;
    awayScore: number;
    competition: string;
  };
  selections: TicketLegSelectionDto[];
}

export interface TicketDto {
  id: string;
  code: string;
  type: TicketType;
  status: TicketStatus;
  stakeBani: number;
  totalOddsMilli: number;
  potentialWinBani: number;
  payoutBani: number | null;
  cashedOutBani: number | null;
  isLive: boolean;
  oddsChangePreference: OddsChangePreference;
  placedAt: string;
  settledAt: string | null;
  cashedOutAt: string | null;
  legs: TicketLegDto[];
}

/** F1.11 price of a Bet Builder combination on one match (GET /catalog/builder). */
export type BuilderQuoteDto = { eventId: string; selectionIds: string[] } & (
  | { available: true; oddsMilli: number; source: 'PROVIDER' | 'MODEL' }
  | {
      available: false;
      /** BuilderError, ONE_MATCH, or the first selection's block (EVENT_SUSPENDED, MARKET_SUSPENDED, …) */
      reason: string;
      selectionId?: string;
    }
);

/** F2.3 the live cash-out offer for an open ticket (re-checked on accept, F2.6). */
export type CashOutQuoteDto = { ticketId: string; quotedAt: string } & (
  | { available: true; offerBani: number }
  | { available: false; reason: CashOutUnavailableReason | 'DISABLED' | 'NOT_OPEN' }
);

export interface WalletTransactionDto {
  id: string;
  type: WalletTxType;
  amountBani: number;
  balanceAfterBani: number;
  reason: string;
  ticketId: string | null;
  ticketCode: string | null;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
