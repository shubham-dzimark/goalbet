import { Logger } from '@nestjs/common';
import { type Redis } from 'ioredis';
import { type EventStatus, type MarketType, type MatchPeriod } from '@goalbet/shared';
import {
  type OddsProvider,
  type ProviderCompetition,
  type ProviderFixture,
  type ProviderLiveState,
  type ProviderMarket,
  type ProviderResult,
} from '../odds-provider.js';
import { type PricingState, priceMarkets } from '../mock/pricing.js';
import { type ApiFootballClient, BudgetExceededError } from './api-football.client.js';

/** API-Football league ids for the competitions in the brief (override with API_FOOTBALL_LEAGUES). */
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
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null; extra?: number | null } };
  league: { id: number; name: string; country: string };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
  score: { halftime: { home: number | null; away: number | null } };
}

interface Prediction {
  teams: {
    home: { league?: { goals?: { for?: { average?: { home?: string } }; against?: { average?: { home?: string } } } } };
    away: { league?: { goals?: { for?: { average?: { away?: string } }; against?: { average?: { away?: string } } } } };
  };
}

interface Cached<T> {
  at: number;
  data: T;
}

const STATUS: Record<string, { status: EventStatus; period: MatchPeriod }> = {
  TBD: { status: 'SCHEDULED', period: 'NOT_STARTED' },
  NS: { status: 'SCHEDULED', period: 'NOT_STARTED' },
  '1H': { status: 'LIVE', period: 'FIRST_HALF' },
  HT: { status: 'LIVE', period: 'HALF_TIME' },
  '2H': { status: 'LIVE', period: 'SECOND_HALF' },
  ET: { status: 'LIVE', period: 'SECOND_HALF' },
  BT: { status: 'LIVE', period: 'SECOND_HALF' },
  P: { status: 'LIVE', period: 'SECOND_HALF' },
  SUSP: { status: 'LIVE', period: 'SECOND_HALF' },
  INT: { status: 'LIVE', period: 'SECOND_HALF' },
  LIVE: { status: 'LIVE', period: 'SECOND_HALF' },
  FT: { status: 'FINISHED', period: 'FULL_TIME' },
  AET: { status: 'FINISHED', period: 'FULL_TIME' },
  PEN: { status: 'FINISHED', period: 'FULL_TIME' },
  PST: { status: 'CANCELLED', period: 'NOT_STARTED' },
  CANC: { status: 'CANCELLED', period: 'NOT_STARTED' },
  ABD: { status: 'CANCELLED', period: 'NOT_STARTED' },
  AWD: { status: 'FINISHED', period: 'FULL_TIME' },
  WO: { status: 'FINISHED', period: 'FULL_TIME' },
};

/** Goal-based markets only: corners, cards and player stats are not affordable on the free plan. */
const OFFERED: Set<MarketType> = new Set([
  'MATCH_RESULT',
  'DOUBLE_CHANCE',
  'TOTAL_GOALS',
  'TEAM_TOTAL_GOALS',
  'BTTS',
  'EUROPEAN_HANDICAP',
  'ASIAN_HANDICAP',
  'CORRECT_SCORE',
]);

const MIN = 60_000;
const HOUR = 60 * MIN;
const LEAGUE_AVG = { home: 1.45, away: 1.15 };
const LIVE_WINDOW_MS = 135 * MIN;
const MIN_LIVE_INTERVAL_MS = 2 * MIN;
const RESERVE_CALLS = 12;
const PREDICTION_HORIZON_MS = 30 * HOUR;

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const num = (v: string | undefined) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * Real football data from API-Football (ODDS_PROVIDER=api-football), designed for the free plan:
 * fixtures for yesterday → tomorrow, live scores, half-time scores and final results are real;
 * prices come from GoalBet's Poisson model fed with each team's real scoring averages (pre-match)
 * and the real score and minute (live). Every call goes through a shared Redis budget; responses
 * are cached in Redis so the API and worker never fetch the same thing twice.
 */
export class ApiFootballProvider implements OddsProvider {
  readonly name = 'api-football';
  readonly capabilities = { betBuilderPricing: false, cashOutData: false };
  private readonly logger = new Logger(ApiFootballProvider.name);
  private readonly leagues: number[];

  constructor(
    private readonly client: ApiFootballClient,
    private readonly redis: Redis,
    leagues?: number[],
  ) {
    this.leagues = leagues?.length ? leagues : Object.keys(API_FOOTBALL_LEAGUES).map(Number);
  }

  // ───────────── caching helpers ─────────────

  private async cached<T>(key: string, maxAgeMs: number, load: () => Promise<T>, ttlSec = 3 * 86_400): Promise<T | null> {
    const raw = await this.redis.get(key);
    const hit = raw ? (JSON.parse(raw) as Cached<T>) : null;
    if (hit && Date.now() - hit.at < maxAgeMs) return hit.data;
    // single-flight across processes
    const lock = await this.redis.set(`${key}:lock`, '1', 'EX', 30, 'NX');
    if (!lock) return hit?.data ?? null;
    try {
      const data = await load();
      await this.redis.set(key, JSON.stringify({ at: Date.now(), data } satisfies Cached<T>), 'EX', ttlSec);
      return data;
    } catch (e) {
      if (!(e instanceof BudgetExceededError)) this.logger.warn((e as Error).message);
      return hit?.data ?? null;
    } finally {
      await this.redis.del(`${key}:lock`);
    }
  }

  private ours(list: ApiFixture[]) {
    return list.filter((f) => this.leagues.includes(f.league.id));
  }

  /** All of our fixtures for a UTC day (one call returns every league; we keep ours). */
  private async day(date: string): Promise<ApiFixture[]> {
    const today = isoDay(Date.now());
    const maxAge = date === today ? 3 * HOUR : date < today ? 24 * HOUR : 6 * HOUR;
    const data = await this.cached(`af:fx:${date}`, maxAge, async () =>
      this.ours(await this.client.get<ApiFixture>('/fixtures', { date, timezone: 'UTC' })),
    );
    return data ?? [];
  }

  private async knownFixtures(): Promise<ApiFixture[]> {
    const now = Date.now();
    const days = [isoDay(now - 86_400_000), isoDay(now), isoDay(now + 86_400_000)];
    return (await Promise.all(days.map((d) => this.day(d)))).flat();
  }

  private async fixtureById(id: number): Promise<ApiFixture | undefined> {
    const raw = await this.redis.get(`af:res:${id}`);
    if (raw) return JSON.parse(raw) as ApiFixture;
    return (await this.knownFixtures()).find((f) => f.fixture.id === id);
  }

  // ───────────── OddsProvider ─────────────

  async getCompetitions(): Promise<ProviderCompetition[]> {
    return this.leagues.map((id, i) => {
      const l = API_FOOTBALL_LEAGUES[id] ?? { name: `League ${id}`, country: 'World', countryCode: 'WW', isTop: false };
      return { ref: `af-league-${id}`, ...l, sortOrder: i };
    });
  }

  async getFixtures(from: Date, to: Date): Promise<ProviderFixture[]> {
    const fixtures = await this.knownFixtures();
    return fixtures
      .filter((f) => {
        const t = new Date(f.fixture.date).getTime();
        return t >= from.getTime() && t <= to.getTime();
      })
      .map((f) => ({
        ref: `af-${f.fixture.id}`,
        competitionRef: `af-league-${f.league.id}`,
        home: f.teams.home.name,
        away: f.teams.away.name,
        startTime: new Date(f.fixture.date),
        isTop: API_FOOTBALL_LEAGUES[f.league.id]?.isTop ?? false,
        players: [],
      }));
  }

  /** Live scores. Polls only while one of our matches can be in play, spreading the remaining budget. */
  async getLiveStates(): Promise<ProviderLiveState[]> {
    const now = Date.now();
    const fixtures = await this.knownFixtures();
    const window = fixtures.filter((f) => {
      const k = new Date(f.fixture.date).getTime();
      return k <= now && now <= k + LIVE_WINDOW_MS && STATUS[f.fixture.status.short]?.status !== 'FINISHED';
    });
    if (window.length === 0) return [];

    const lastEnd = Math.max(...window.map((f) => new Date(f.fixture.date).getTime() + LIVE_WINDOW_MS));
    const budget = Math.max(1, (await this.client.remaining()) - RESERVE_CALLS);
    const interval = Math.max(MIN_LIVE_INTERVAL_MS, (lastEnd - now) / budget);
    const live = await this.cached('af:live', interval, async () =>
      this.client.get<ApiFixture>('/fixtures', { live: this.leagues.join('-'), timezone: 'UTC' }),
    );
    const meta = await this.redis.get('af:live');
    const fetchedAt = meta ? (JSON.parse(meta) as Cached<unknown>).at : now;

    const states: ProviderLiveState[] = [];
    for (const f of live ?? []) states.push(this.toLiveState(f, now - fetchedAt));
    // Kicked off per schedule but not in the live list any more → queue a result check.
    const liveIds = new Set((live ?? []).map((f) => f.fixture.id));
    const gone = window.filter((f) => !liveIds.has(f.fixture.id) && now - new Date(f.fixture.date).getTime() > 20 * MIN);
    if (gone.length) await this.redis.sadd('af:pending', ...gone.map((f) => String(f.fixture.id)));
    return states;
  }

  private toLiveState(f: ApiFixture, sinceFetchMs: number): ProviderLiveState {
    const st = STATUS[f.fixture.status.short] ?? { status: 'LIVE' as const, period: 'SECOND_HALF' as const };
    let minute = f.fixture.status.elapsed;
    // keep the clock moving between polls
    if (minute !== null && (st.period === 'FIRST_HALF' || st.period === 'SECOND_HALF')) {
      const cap = st.period === 'FIRST_HALF' ? 50 : 97;
      minute = Math.min(cap, minute + Math.floor(sinceFetchMs / MIN));
    }
    const halfDone = st.period === 'HALF_TIME' || st.period === 'SECOND_HALF' || st.period === 'FULL_TIME';
    return {
      ref: `af-${f.fixture.id}`,
      status: st.status,
      period: st.period,
      minute,
      homeScore: f.goals.home ?? 0,
      awayScore: f.goals.away ?? 0,
      htHomeScore: halfDone ? (f.score.halftime.home ?? null) : null,
      htAwayScore: halfDone ? (f.score.halftime.away ?? null) : null,
      corners: 0,
      cards: 0,
      suspended: f.fixture.status.short === 'SUSP' || f.fixture.status.short === 'INT',
    };
  }

  /** Final result, fetched in batches of up to 20 pending fixtures per call and cached. */
  async getResult(fixtureRef: string): Promise<ProviderResult | null> {
    const id = Number(fixtureRef.replace(/^af-/, ''));
    if (!Number.isFinite(id)) return null;
    let f = await this.fixtureById(id);
    const final = (x?: ApiFixture) => !!x && ['FINISHED', 'CANCELLED'].includes(STATUS[x.fixture.status.short]?.status ?? '');
    if (!final(f)) {
      await this.redis.sadd('af:pending', String(id));
      await this.cached('af:results-batch', 5 * MIN, async () => {
        const ids = (await this.redis.smembers('af:pending')).slice(0, 20);
        if (ids.length === 0) return [];
        const list = await this.client.get<ApiFixture>('/fixtures', { ids: ids.join('-'), timezone: 'UTC' });
        for (const x of list) {
          if (final(x)) {
            await this.redis.set(`af:res:${x.fixture.id}`, JSON.stringify(x), 'EX', 7 * 86_400);
            await this.redis.srem('af:pending', String(x.fixture.id));
          }
        }
        return list.map((x) => x.fixture.id);
      });
      f = await this.fixtureById(id);
    }
    if (!f || !final(f)) return null;
    const st = STATUS[f.fixture.status.short]!;
    return {
      ref: fixtureRef,
      status: st.status === 'CANCELLED' ? 'CANCELLED' : 'FINISHED',
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

  /** Expected goals per team from real home/away scoring and conceding averages (cached 24 h). */
  private async lambdas(fixtureId: number, kickoff: number): Promise<{ home: number; away: number }> {
    // spend prediction calls only on matches close to kick-off
    if (kickoff - Date.now() > PREDICTION_HORIZON_MS) return LEAGUE_AVG;
    const pred = await this.cached(`af:pred:${fixtureId}`, 24 * HOUR, async () => {
      const [p] = await this.client.get<Prediction>('/predictions', { fixture: fixtureId });
      if (!p) return null;
      const hf = num(p.teams.home.league?.goals?.for?.average?.home);
      const ha = num(p.teams.home.league?.goals?.against?.average?.home);
      const af = num(p.teams.away.league?.goals?.for?.average?.away);
      const aa = num(p.teams.away.league?.goals?.against?.average?.away);
      // blend with league averages so early-season samples do not produce extreme prices
      const blend = (a: number | null, b: number | null, base: number) => {
        const vals = [a, b].filter((v): v is number => v !== null && v > 0);
        const raw = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : base;
        return Math.min(3.2, Math.max(0.35, 0.6 * raw + 0.4 * base));
      };
      return { home: blend(hf, aa, LEAGUE_AVG.home), away: blend(af, ha, LEAGUE_AVG.away) };
    });
    return pred ?? LEAGUE_AVG;
  }

  async getMarkets(fixtureRef: string): Promise<ProviderMarket[]> {
    const id = Number(fixtureRef.replace(/^af-/, ''));
    const f = await this.fixtureById(id);
    if (!f) return [];
    const st = STATUS[f.fixture.status.short]?.status ?? 'SCHEDULED';
    if (st === 'FINISHED' || st === 'CANCELLED') return [];

    const lam = await this.lambdas(id, new Date(f.fixture.date).getTime());
    let state: ProviderLiveState | null = null;
    if (st === 'LIVE' || Date.now() >= new Date(f.fixture.date).getTime()) {
      const raw = await this.redis.get('af:live');
      const live = raw ? (JSON.parse(raw) as Cached<ApiFixture[]>) : null;
      const lf = live?.data.find((x) => x.fixture.id === id);
      if (lf) state = this.toLiveState(lf, Date.now() - live!.at);
    }

    const minute = state?.minute ?? 0;
    const period = state?.period ?? 'NOT_STARTED';
    const remainingMin = !state ? 90 : period === 'HALF_TIME' ? 45 : Math.max(0, 90 - minute);
    const remainingH1 = !state ? 45 : period === 'FIRST_HALF' ? Math.max(0, 45 - minute) : 0;
    const p: PricingState = {
      lambdaHome: (lam.home * remainingMin) / 90,
      lambdaAway: (lam.away * remainingMin) / 90,
      lambdaHomeH1: (lam.home * remainingH1 * 0.9) / 90,
      lambdaAwayH1: (lam.away * remainingH1 * 0.9) / 90,
      homeScore: state?.homeScore ?? 0,
      awayScore: state?.awayScore ?? 0,
      htHome: state?.htHomeScore ?? state?.homeScore ?? 0,
      htAway: state?.htAwayScore ?? state?.awayScore ?? 0,
      h1Open: remainingH1 > 0,
      corners: 0,
      lambdaCorners: 0,
      cards: 0,
      lambdaCards: 0,
      remaining: remainingMin / 90,
      players: [],
      oddsFactorBps: 10_000,
      suspended: state?.suspended ?? false,
    };
    return priceMarkets(p).filter((m) => OFFERED.has(m.type));
  }
}
