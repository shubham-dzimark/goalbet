import { Redis } from 'ioredis';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiFootballClient } from '../src/modules/api-integration/api-football/api-football.client.js';
import { ApiFootballProvider } from '../src/modules/api-integration/api-football/api-football.provider.js';

const redis = new Redis(process.env['TEST_REDIS_URL'] ?? 'redis://127.0.0.1:6379/1');
afterAll(async () => redis.quit());
beforeEach(async () => redis.flushdb());

const fixture = (id: number, short: string, home: number | null, away: number | null) => ({
  fixture: { id, date: '2026-10-20T18:00:00+00:00', status: { short, elapsed: short === 'FT' ? 90 : null } },
  league: { id: 283, name: 'SuperLiga', country: 'Romania' },
  teams: { home: { name: 'Home' }, away: { name: 'Away' } },
  goals: { home, away },
  score: { halftime: { home: home === null ? null : 1, away: away === null ? null : 0 } },
});

/** A fake API-Football client that records every request and serves the given day lists. */
function fakeClient(days: Record<string, unknown[]>) {
  const calls: Record<string, string | number>[] = [];
  const client = {
    get: async (_path: string, params: Record<string, string | number> = {}) => {
      calls.push(params);
      if ('ids' in params) throw new Error('Free plans do not have access to the Ids parameter.');
      return (days[String(params['date'])] ?? []) as never[];
    },
    remaining: async () => 90,
  } as unknown as ApiFootballClient;
  return { client, calls };
}

describe('API-Football results on the free plan', () => {
  it('re-reads the match day (never the ids list) and caches the final result', async () => {
    const days: Record<string, unknown[]> = { '2026-10-20': [fixture(101, 'NS', null, null), fixture(102, 'NS', null, null)] };
    const { client, calls } = fakeClient(days);
    const provider = new ApiFootballProvider(client, redis, [283]);

    // the fixtures sync lists the day once: both matches are remembered with their date
    await (provider as unknown as { day: (d: string) => Promise<unknown[]> }).day('2026-10-20');
    expect(calls).toHaveLength(1);

    // full time: one call for the day resolves both matches
    days['2026-10-20'] = [fixture(101, 'FT', 2, 1), fixture(102, 'FT', 0, 0)];
    await redis.del('af:fx:2026-10-20');
    expect(await provider.getResult('af-101')).toMatchObject({ status: 'FINISHED', outcome: { ftHome: 2, ftAway: 1, htHome: 1, htAway: 0 } });
    expect(await provider.getResult('af-102')).toMatchObject({ status: 'FINISHED', outcome: { ftHome: 0, ftAway: 0 } });
    // the match day was read twice in total (listing + one result check for both matches)
    const dayCalls = () => calls.filter((c) => c['date'] === '2026-10-20').length;
    expect(dayCalls()).toBe(2);
    expect(calls.some((c) => 'ids' in c)).toBe(false);

    // cached: no further calls
    const before = calls.length;
    expect(await provider.getResult('af-101')).not.toBeNull();
    expect(calls).toHaveLength(before);
  });

  it('a match whose day is unknown or not finished yet returns null without spending calls on ids', async () => {
    const { client, calls } = fakeClient({ '2026-10-20': [fixture(201, '2H', 1, 1)] });
    const provider = new ApiFootballProvider(client, redis, [283]);
    expect(await provider.getResult('af-999')).toBeNull();
    await (provider as unknown as { day: (d: string) => Promise<unknown[]> }).day('2026-10-20');
    expect(await provider.getResult('af-201')).toBeNull();
    expect(calls.some((c) => 'ids' in c)).toBe(false);
  });

  it('a match listed before days were remembered is found from its kick-off day', async () => {
    const { client, calls } = fakeClient({ '2026-10-21': [fixture(301, 'FT', 3, 2)] });
    const provider = new ApiFootballProvider(client, redis, [283]);
    expect(await provider.getResult('af-301', new Date('2026-10-21T18:00:00Z'))).toMatchObject({ status: 'FINISHED', outcome: { ftHome: 3, ftAway: 2 } });
    expect(calls.filter((c) => c['date'] === '2026-10-21')).toHaveLength(1);
  });

  it('a date the plan refuses is remembered: no more calls for it, and the refused call is not charged', async () => {
    const calls: Record<string, string | number>[] = [];
    const client = {
      get: async (_path: string, params: Record<string, string | number> = {}) => {
        calls.push(params);
        if (params['date'] === '2026-10-23') throw new Error('api-football /fixtures: {"plan":"Free plans do not have access to this date, try from 2026-10-27 to 2026-10-29."}');
        return [] as never[];
      },
      remaining: async () => 90,
    } as unknown as ApiFootballClient;
    const provider = new ApiFootballProvider(client, redis, [283]);
    const kickoff = new Date('2026-10-23T09:30:00Z');
    expect(await provider.getResult('af-401', kickoff)).toBeNull();
    const refused = calls.filter((c) => c['date'] === '2026-10-23').length;
    expect(refused).toBe(1);
    // the job runs again and again: no further calls for that date
    for (let i = 0; i < 5; i++) await provider.getResult('af-401', kickoff);
    expect(calls.filter((c) => c['date'] === '2026-10-23')).toHaveLength(1);
    expect(JSON.parse((await redis.get('af:date-window'))!)).toEqual({ from: '2026-10-27', to: '2026-10-29' });
  });

  it('the client gives back a call the plan refused, so our daily count matches API-Football', async () => {
    const { ApiFootballClient: Client } = await import('../src/modules/api-integration/api-football/api-football.client.js');
    const client = new Client({ apiKey: 'k', baseUrl: 'https://example.test', dailyBudget: 90, perMinute: 50 }, redis);
    const respond = (errors: object) =>
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ errors, response: [] }), { status: 200, headers: { 'x-ratelimit-requests-remaining': '92' } }));
    const day = new Date().toISOString().slice(0, 10);
    respond({ plan: 'Free plans do not have access to this date' });
    await expect(client.get('/fixtures', { date: '2026-10-23' })).rejects.toThrow(/plan/);
    expect(Number(await redis.get(`af:budget:${day}`))).toBe(0);
    respond([]);
    await client.get('/fixtures', { date: '2026-10-28' });
    expect(Number(await redis.get(`af:budget:${day}`))).toBe(1);
  });
});
