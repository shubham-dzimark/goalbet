import { Logger } from '@nestjs/common';
import { type EventStatus, type MatchPeriod, marketKey, parseOddsMilli } from '@goalbet/shared';
import {
  type OddsProvider,
  type ProviderCompetition,
  type ProviderFixture,
  type ProviderLiveState,
  type ProviderMarket,
  type ProviderResult,
} from '../odds-provider.js';

/** API-Football league ids for the competitions in the brief. */
export const API_FOOTBALL_LEAGUES: Record<number, { name: string; country: string; countryCode: string; isTop: boolean }> = {
  283: { name: 'SuperLiga', country: 'România', countryCode: 'RO', isTop: true },
  39: { name: 'Premier League', country: 'Anglia', countryCode: 'GB', isTop: true },
  140: { name: 'LaLiga', country: 'Spania', countryCode: 'ES', isTop: true },
  135: { name: 'Serie A', country: 'Italia', countryCode: 'IT', isTop: false },
  78: { name: 'Bundesliga', country: 'Germania', countryCode: 'DE', isTop: false },
  61: { name: 'Ligue 1', country: 'Franța', countryCode: 'FR', isTop: false },
  2: { name: 'Liga Campionilor', country: 'Europa', countryCode: 'EU', isTop: true },
};

interface ApiFixture {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
  league: { id: number };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
  score: { halftime: { home: number | null; away: number | null } };
}

const STATUS: Record<string, { status: EventStatus; period: MatchPeriod }> = {
  NS: { status: 'SCHEDULED', period: 'NOT_STARTED' },
  '1H': { status: 'LIVE', period: 'FIRST_HALF' },
  HT: { status: 'LIVE', period: 'HALF_TIME' },
  '2H': { status: 'LIVE', period: 'SECOND_HALF' },
  FT: { status: 'FINISHED', period: 'FULL_TIME' },
  PST: { status: 'CANCELLED', period: 'NOT_STARTED' },
  CANC: { status: 'CANCELLED', period: 'NOT_STARTED' },
  ABD: { status: 'CANCELLED', period: 'NOT_STARTED' },
};

/**
 * Real provider adapter skeleton (ODDS_PROVIDER=api-football). Fixtures, live scores, results and
 * the main 1X2 / goals markets are mapped; the remaining market groups, corners/cards/player stats
 * for settlement, Bet Builder pricing and cash-out data still need the paid feed's mappings.
 */
export class ApiFootballProvider implements OddsProvider {
  readonly name = 'api-football';
  readonly capabilities = { betBuilderPricing: false, cashOutData: false };
  private readonly logger = new Logger(ApiFootballProvider.name);

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  private async get<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await fetch(url, { headers: { 'x-apisports-key': this.apiKey } });
    if (!res.ok) throw new Error(`api-football ${path} ${res.status}`);
    const body = (await res.json()) as { response: T[] };
    return body.response;
  }

  async getCompetitions(): Promise<ProviderCompetition[]> {
    return Object.entries(API_FOOTBALL_LEAGUES).map(([id, l], i) => ({ ref: `af-league-${id}`, ...l, sortOrder: i }));
  }

  async getFixtures(from: Date, to: Date): Promise<ProviderFixture[]> {
    const season = from.getUTCMonth() >= 6 ? from.getUTCFullYear() : from.getUTCFullYear() - 1;
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const all = await Promise.all(
      Object.keys(API_FOOTBALL_LEAGUES).map((league) =>
        this.get<ApiFixture>('/fixtures', { league, season, from: day(from), to: day(to) }),
      ),
    );
    return all.flat().map((f) => ({
      ref: `af-${f.fixture.id}`,
      competitionRef: `af-league-${f.league.id}`,
      home: f.teams.home.name,
      away: f.teams.away.name,
      startTime: new Date(f.fixture.date),
      isTop: API_FOOTBALL_LEAGUES[f.league.id]?.isTop ?? false,
      players: [], // TODO: /players/squads for player markets
    }));
  }

  async getMarkets(fixtureRef: string): Promise<ProviderMarket[]> {
    const id = fixtureRef.replace(/^af-/, '');
    type Odds = { bookmakers: { bets: { id: number; values: { value: string; odd: string }[] }[] }[] };
    const [odds] = await this.get<Odds>('/odds', { fixture: id });
    const bets = odds?.bookmakers[0]?.bets ?? [];
    const out: ProviderMarket[] = [];
    const winner = bets.find((b) => b.id === 1);
    if (winner) {
      const map: Record<string, string> = { Home: 'HOME', Draw: 'DRAW', Away: 'AWAY' };
      out.push({
        key: marketKey({ type: 'MATCH_RESULT', period: 'FT', line: null, team: null, playerRef: null }),
        type: 'MATCH_RESULT',
        period: 'FT',
        line: null,
        team: null,
        playerRef: null,
        playerName: null,
        suspended: false,
        selections: winner.values
          .filter((v) => map[v.value])
          .map((v) => ({ outcome: map[v.value]!, label: null, team: null, oddsMilli: parseOddsMilli(v.odd) })),
      });
    }
    // TODO: map Goals Over/Under (bet 5), BTTS (8), Double Chance (12), Handicaps (4, 9), Correct Score (10),
    // Corners, Cards and player markets once the production feed plan is chosen.
    return out;
  }

  async getLiveStates(): Promise<ProviderLiveState[]> {
    const live = await this.get<ApiFixture>('/fixtures', { live: Object.keys(API_FOOTBALL_LEAGUES).join('-') });
    return live.map((f) => {
      const st = STATUS[f.fixture.status.short] ?? { status: 'LIVE' as const, period: 'SECOND_HALF' as const };
      return {
        ref: `af-${f.fixture.id}`,
        status: st.status,
        period: st.period,
        minute: f.fixture.status.elapsed,
        homeScore: f.goals.home ?? 0,
        awayScore: f.goals.away ?? 0,
        htHomeScore: f.score.halftime.home,
        htAwayScore: f.score.halftime.away,
        corners: 0, // TODO: /fixtures/statistics
        cards: 0,
        suspended: false,
      };
    });
  }

  async getResult(fixtureRef: string): Promise<ProviderResult | null> {
    const [f] = await this.get<ApiFixture>('/fixtures', { id: fixtureRef.replace(/^af-/, '') });
    if (!f) return null;
    const st = STATUS[f.fixture.status.short];
    if (st?.status !== 'FINISHED' && st?.status !== 'CANCELLED') return null;
    this.logger.warn(`settling ${fixtureRef} without corners/cards/player stats (skeleton adapter)`);
    return {
      ref: fixtureRef,
      status: st.status,
      outcome: {
        cancelled: st.status === 'CANCELLED',
        ftHome: f.goals.home ?? 0,
        ftAway: f.goals.away ?? 0,
        htHome: f.score.halftime.home ?? 0,
        htAway: f.score.halftime.away ?? 0,
        corners: 0,
        cards: 0,
        players: {},
      },
    };
  }
}
