import {
  type EventStatus,
  type MarketPeriod,
  type MarketType,
  type MatchOutcome,
  type MatchPeriod,
  type OddsMilli,
  type Team,
} from '@goalbet/shared';

/**
 * F4.1 — contract every sports data / odds provider implements. Football only (F0.1).
 * The engine never trusts frontend odds: everything priced comes through this interface.
 */
export interface ProviderCompetition {
  ref: string;
  name: string;
  country: string;
  countryCode: string;
  isTop: boolean;
  sortOrder: number;
}

export interface ProviderPlayer {
  ref: string;
  name: string;
  team: Team;
  position: 'GK' | 'DF' | 'MF' | 'FW';
}

export interface ProviderFixture {
  ref: string;
  competitionRef: string;
  home: string;
  away: string;
  startTime: Date;
  isTop: boolean;
  players: ProviderPlayer[];
}

export interface ProviderSelection {
  outcome: string;
  label: string | null;
  team: Team | null;
  /** null = currently no price (selection inactive). */
  oddsMilli: OddsMilli | null;
}

export interface ProviderMarket {
  key: string;
  type: MarketType;
  period: MarketPeriod;
  line: number | null;
  team: Team | null;
  playerRef: string | null;
  playerName: string | null;
  suspended: boolean;
  selections: ProviderSelection[];
}

/** Live scores / match state (also returned shortly after full time). */
export interface ProviderLiveState {
  ref: string;
  status: EventStatus;
  period: MatchPeriod;
  minute: number | null;
  homeScore: number;
  awayScore: number;
  htHomeScore: number | null;
  htAwayScore: number | null;
  corners: number;
  cards: number;
  /** Provider-side suspension (goal scored, VAR, feed issue). */
  suspended: boolean;
}

export interface ProviderResult {
  ref: string;
  status: 'FINISHED' | 'CANCELLED';
  outcome: MatchOutcome;
}

export interface BuilderPriceRequest {
  marketKey: string;
  outcome: string;
}

export interface OddsProvider {
  readonly name: string;
  readonly capabilities: { betBuilderPricing: boolean; cashOutData: boolean };

  /** Competitions (leagues) — football only. */
  getCompetitions(): Promise<ProviderCompetition[]>;
  /** Fixtures with kickoff inside [from, to]. */
  getFixtures(from: Date, to: Date): Promise<ProviderFixture[]>;
  /** Pre-match odds, or in-play markets + live odds when the fixture is live. */
  getMarkets(fixtureRef: string): Promise<ProviderMarket[]>;
  /** Live scores for fixtures that are live (and those that just finished). */
  getLiveStates(): Promise<ProviderLiveState[]>;
  /**
   * When the live data last returned by getLiveStates was fetched from the source (epoch ms).
   * Providers that cache live data (to save API calls) must implement it, so the feed-stall
   * check measures how fresh the scores really are; omitted = fetched just now.
   */
  liveDataTime?(): Promise<number | null>;
  /** Final result for settlement; null while not finished. `kickoff` helps providers find the match day. */
  getResult(fixtureRef: string, kickoff?: Date): Promise<ProviderResult | null>;
  /** Correlated price for a same-match combination (if supported). */
  priceBetBuilder?(fixtureRef: string, selections: BuilderPriceRequest[]): Promise<OddsMilli | null>;
  /** Provider-side cash-out value for a ticket (if supported). */
  getCashOutValue?(ticketRef: string): Promise<number | null>;
}

export const ODDS_PROVIDER = Symbol('ODDS_PROVIDER');
