import { Redis } from 'ioredis';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFootballClient } from '../src/modules/api-integration/api-football/api-football.client.js';
import { ApiFootballProvider, FREE_PROFILE, PAID_PROFILE } from '../src/modules/api-integration/api-football/api-football.provider.js';

const redis = new Redis(process.env['TEST_REDIS_URL'] ?? 'redis://127.0.0.1:6379/1');
afterAll(async () => redis.quit());
beforeEach(async () => redis.flushdb());
afterEach(() => vi.restoreAllMocks());

const opts = { apiKey: 'k', baseUrl: 'https://api.test', dailyBudget: 90, perMinute: 8 };
const json = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });
const status = (plan: string, limitDay: number) => ({ errors: [], response: { subscription: { plan, active: true }, requests: { current: 0, limit_day: limitDay } } });

/** A fake API-Football: /status reports `plan.current`, /fixtures answers with that plan's daily limit header. */
function fakeApi(plan: { current: [string, number] }) {
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    const [name, limit] = plan.current;
    if (url.pathname === '/status') return json(status(name, limit));
    return json({ errors: [], response: [] }, { 'x-ratelimit-requests-limit': String(limit), 'x-ratelimit-requests-remaining': String(limit - 1) });
  });
  return calls;
}

describe('API-Football plan detection', () => {
  it('uses the free budgets on the free plan and the paid ones after an upgrade, without config changes', async () => {
    const plan = { current: ['Free', 100] as [string, number] };
    const calls = fakeApi(plan);
    const client = new ApiFootballClient(opts, redis);

    expect(await client.budgets()).toMatchObject({ daily: 95, perMinute: 9, plan: { plan: 'Free', paid: false } });
    // detected once, then cached
    await client.budgets();
    expect(calls.filter((c) => c === '/status')).toHaveLength(1);

    // the user upgrades: the next response carries the new daily limit and the plan is re-read
    plan.current = ['Pro', 7500];
    await client.get('/fixtures', { date: '2026-11-12' });
    expect(await client.budgets()).toMatchObject({ daily: 7125, perMinute: 270, plan: { plan: 'Pro', limitDay: 7500, paid: true } });
    expect(calls.filter((c) => c === '/status')).toHaveLength(2);
  });

  it('forgets the free plan date window and lists the whole week on a paid plan', async () => {
    const plan = { current: ['Free', 100] as [string, number] };
    const calls = fakeApi(plan);
    const client = new ApiFootballClient(opts, redis);
    const provider = new ApiFootballProvider(client, redis, [283]);
    const listed = () => calls.filter((c) => c.startsWith('/fixtures?date=')).length;

    await provider.getFixtures(new Date(), new Date(Date.now() + 7 * 86_400_000));
    expect(listed()).toBe(3); // yesterday, today, tomorrow
    await redis.set('af:date-window', JSON.stringify({ from: '2026-01-01', to: '2026-01-03' }));

    plan.current = ['Pro', 7500];
    await redis.del('af:plan');
    await client.budgets();
    expect(await redis.get('af:date-window')).toBeNull();
    await redis.del(...(await redis.keys('af:fx:*')));
    await provider.getFixtures(new Date(), new Date(Date.now() + 7 * 86_400_000));
    expect(listed()).toBe(3 + 9); // yesterday → 7 days ahead
  });

  it('uses the admin share of the plan, and keeps the free pacing when that share is small', async () => {
    fakeApi({ current: ['Pro', 7500] });
    let share = 50;
    const client = new ApiFootballClient({ ...opts, planShare: async () => share }, redis);
    const provider = new ApiFootballProvider(client, redis, [283]);
    const profile = () => (provider as unknown as { profile: () => Promise<{ p: unknown }> }).profile();
    expect(await client.budgets()).toMatchObject({ daily: 3750, perMinute: 150 });
    expect((await profile()).p).toBe(PAID_PROFILE);
    share = 20;
    expect(await client.budgets()).toMatchObject({ daily: 1500, perMinute: 60 });
    expect((await profile()).p).toBe(FREE_PROFILE);
    // 100% never goes past the plan, and the per-minute share stays under 90%
    share = 100;
    expect(await client.budgets()).toMatchObject({ daily: 7500, perMinute: 270 });
  });

  it('falls back to the configured budgets when the plan cannot be read, and retries later, not on every call', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const client = new ApiFootballClient(opts, redis);
    expect(await client.budgets()).toEqual({ daily: 90, perMinute: 8, plan: null });
    await client.budgets();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
