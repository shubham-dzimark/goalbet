import { readFileSync } from 'node:fs';
import { Redis } from 'ioredis';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { marketKey } from '@goalbet/shared';
import { type ApiFootballClient } from '../src/modules/api-integration/api-football/api-football.client.js';
import { ApiFootballProvider } from '../src/modules/api-integration/api-football/api-football.provider.js';
import { type ApiOddsResponse, parseBookOdds } from '../src/modules/api-integration/api-football/bookmaker-odds.js';

/** Real /odds response (Leeds – Tottenham, Betano + Bet365, goal markets only). */
const ODDS = JSON.parse(readFileSync(new URL('./data/api-football-odds.json', import.meta.url), 'utf8')) as ApiOddsResponse;
const key = (type: string, p: Record<string, unknown> = {}) =>
  marketKey({ type: type as never, period: 'FT', line: null, team: null, playerRef: null, ...p });

const redis = new Redis(process.env['TEST_REDIS_URL'] ?? 'redis://127.0.0.1:6379/1');
afterAll(async () => redis.quit());
beforeEach(async () => redis.flushdb());

describe('bookmaker odds (API-Football /odds)', () => {
  it('prefers Superbet, then Betano, and maps the goal markets onto ours', () => {
    const b = parseBookOdds(ODDS)!;
    expect(b.bookmaker).toBe('Betano');
    expect(b.prices[key('MATCH_RESULT')]).toEqual({ HOME: 2750, DRAW: 3350, AWAY: 2570 });
    expect(b.prices[key('BTTS')]).toEqual({ YES: 1700, NO: 2070 });
    expect(b.prices[key('TOTAL_GOALS', { line: 150 })]).toEqual({ OVER: 1320, UNDER: 3450 });
    // whole-goal lines settle differently from ours: skipped
    expect(b.prices[key('TOTAL_GOALS', { line: 200 })]).toBeUndefined();
    // Asian handicap: one home line for both sides ("Away -0.5" = away +0.5)
    expect(b.prices[key('ASIAN_HANDICAP', { line: -50 })]).toEqual({ HOME: 2700, AWAY: 1500 });
    expect(b.prices[key('CORRECT_SCORE')]?.['1-0']).toBe(8750);
    expect(b.prices[key('MATCH_RESULT', { period: 'H1' })]).toEqual({ HOME: 3350, DRAW: 2100, AWAY: 3200 });

    // a preference list without Betano falls through to Bet365
    expect(parseBookOdds(ODDS, [34, 8])!.prices[key('MATCH_RESULT')]).toEqual({ HOME: 2700, DRAW: 3300, AWAY: 2600 });
    expect(parseBookOdds({ bookmakers: [] })).toBeNull();
  });

  it('fits expected goals that reproduce the book (balanced match, ~2.6 goals)', () => {
    const { lambdas } = parseBookOdds(ODDS)!;
    expect(lambdas!.home).toBeGreaterThan(1.1);
    expect(lambdas!.home).toBeLessThan(1.7);
    expect(lambdas!.away).toBeGreaterThan(1.1);
    expect(lambdas!.away).toBeLessThan(1.7);
    expect(Math.abs(lambdas!.home - lambdas!.away)).toBeLessThan(0.2);
  });

  it('pre-match markets carry the book prices; markets the book lacks are priced from the fit', async () => {
    const kickoff = new Date(Date.now() + 6 * 3600_000).toISOString();
    const fixture = {
      fixture: { id: 501, date: kickoff, status: { short: 'NS', elapsed: null } },
      league: { id: 39, name: 'Premier League', country: 'England' },
      teams: { home: { name: 'Leeds' }, away: { name: 'Tottenham' } },
      goals: { home: null, away: null },
      score: { halftime: { home: null, away: null } },
    };
    const calls: string[] = [];
    const client = {
      get: async (path: string) => {
        calls.push(path);
        if (path === '/odds') return [ODDS] as never[];
        if (path === '/fixtures') return [fixture] as never[];
        return [] as never[];
      },
      remaining: async () => 90,
    } as unknown as ApiFootballClient;
    const provider = new ApiFootballProvider(client, redis, [39]);

    const markets = await provider.getMarkets('af-501');
    const price = (k: string, o: string) => markets.find((m) => m.key === k)?.selections.find((s) => s.outcome === o)?.oddsMilli;
    expect(price(key('MATCH_RESULT'), 'HOME')).toBe(2750);
    expect(price(key('MATCH_RESULT'), 'DRAW')).toBe(3350);
    const over25 = ODDS.bookmakers.find((b) => b.id === 32)!.bets.find((b) => b.id === 5)!.values.find((v) => v.value === 'Over 2.5')!.odd;
    expect(price(key('TOTAL_GOALS', { line: 250 }), 'OVER')).toBe(Math.round(Number(over25) * 1000));
    // OTHER is not in the book: modelled, and a long price for a balanced match
    expect(price(key('CORRECT_SCORE'), 'OTHER')).toBeGreaterThan(5000);
    // no predictions call: the fit replaces it
    expect(calls.filter((c) => c === '/odds')).toHaveLength(1);
    expect(calls).not.toContain('/predictions');

    // cached: a second pricing run spends no more calls
    await provider.getMarkets('af-501');
    expect(calls.filter((c) => c === '/odds')).toHaveLength(1);
  });
});
