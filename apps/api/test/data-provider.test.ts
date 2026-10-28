import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ODDS_PROVIDER } from '../src/modules/api-integration/odds-provider.js';
import { type ProviderRouter } from '../src/modules/api-integration/provider-router.js';
import { type TestContext, adminLogin, createAdmin, createTestApp, resetDb } from './helpers.js';

let ctx: TestContext;
const FAKE_KEY = 'test-key-0123456789abcd';

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));
afterEach(() => vi.restoreAllMocks());

async function as(role: 'SUPER_ADMIN' | 'OPERATOR' | 'FINANCE') {
  const admin = await createAdmin(ctx, role);
  return { ...admin, auth: { Authorization: `Bearer ${await adminLogin(ctx, admin)}` } };
}
const router = () => ctx.app.get(ODDS_PROVIDER) as ProviderRouter;
const save = (auth: Record<string, string>, body: object) => ctx.http().put('/admin/data-provider').set(auth).send({ leagues: [283, 39], dailyBudget: 90, perMinute: 8, reason: 'Switch provider', ...body });

describe('F4.1 data provider managed in the admin panel', () => {
  it('only Super admins can see or change it; env values are used until saved', async () => {
    const op = await as('OPERATOR');
    await ctx.http().get('/admin/data-provider').set(op.auth).expect(403);
    const sa = await as('SUPER_ADMIN');
    const res = await ctx.http().get('/admin/data-provider').set(sa.auth).expect(200);
    expect(res.body).toMatchObject({ provider: 'mock', source: 'env', apiKey: { set: false, hint: null }, usage: null });
    expect(res.body.leagues.find((l: { id: number }) => l.id === 283)).toMatchObject({ name: 'SuperLiga', selected: true });
  });

  it('stores the API key encrypted, shows only its last 4 characters, never logs it, and switches without a restart', async () => {
    const sa = await as('SUPER_ADMIN');
    const noKey = await save(sa.auth, { provider: 'api-football' });
    expect(noKey.body.error).toMatchObject({ code: 'VALIDATION_FAILED' });

    const res = await save(sa.auth, { provider: 'api-football', apiKey: FAKE_KEY }).expect(200);
    expect(res.body).toMatchObject({ provider: 'api-football', source: 'admin', apiKey: { set: true, hint: 'abcd' }, usage: { budget: 90 } });
    expect(JSON.stringify(res.body)).not.toContain(FAKE_KEY);

    const row = await ctx.prisma.dataProviderConfig.findUniqueOrThrow({ where: { id: 'default' } });
    expect(row.apiKeyEnc).toBeTruthy();
    expect(row.apiKeyEnc).not.toContain(FAKE_KEY);
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'DATA_PROVIDER_UPDATED' } });
    expect(JSON.stringify(audit)).not.toContain(FAKE_KEY);
    expect(audit.after).toMatchObject({ provider: 'api-football', apiKey: 'replaced (…abcd)' });

    // the engine now talks to API-Football through the router
    expect((await router().resolve()).name).toBe('api-football');
    expect(await router().mock()).toBeNull();

    // keeping the key (omitted) and switching back to the demo feed
    await save(sa.auth, { provider: 'mock' }).expect(200);
    expect((await router().resolve()).name).toBe('mock');
    expect((await ctx.http().get('/admin/data-provider').set(sa.auth)).body.apiKey).toMatchObject({ set: true, hint: 'abcd' });

    // removing the key while API-Football is selected is refused
    await save(sa.auth, { provider: 'api-football' }).expect(200);
    expect((await save(sa.auth, { provider: 'api-football', apiKey: null })).body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects unknown leagues', async () => {
    const sa = await as('SUPER_ADMIN');
    expect((await save(sa.auth, { provider: 'mock', leagues: [999999] })).body.error.code).toBe('VALIDATION_FAILED');
  });

  it('tests a key against API-Football /status without saving it', async () => {
    const sa = await as('SUPER_ADMIN');
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.endsWith('/status')) throw new Error(`unexpected call ${url}`);
      const key = (init?.headers as Record<string, string>)['x-apisports-key'];
      const body =
        key === FAKE_KEY
          ? { errors: [], response: { subscription: { plan: 'Free', end: '2027-01-01T00:00:00+00:00', active: true }, requests: { current: 12, limit_day: 100 } } }
          : { errors: { token: 'Error/Missing application key.' }, response: [] };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const ok = await ctx.http().post('/admin/data-provider/test').set(sa.auth).send({ apiKey: FAKE_KEY }).expect(200);
    expect(ok.body).toMatchObject({ ok: true, plan: 'Free', active: true, requestsToday: 12, limitDay: 100 });
    const bad = await ctx.http().post('/admin/data-provider/test').set(sa.auth).send({ apiKey: 'wrong-key-123456' }).expect(200);
    expect(bad.body).toMatchObject({ ok: false, error: 'Error/Missing application key.' });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await ctx.prisma.dataProviderConfig.count()).toBe(0);
  });

  it('starts a manual sync', async () => {
    const sa = await as('SUPER_ADMIN');
    await ctx.http().post('/admin/data-provider/sync').set(sa.auth).expect(202);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'DATA_PROVIDER_SYNC' } })).toBe(1);
  });

  it('after switching to API-Football, matches from the demo feed still get their results (old bets settle)', async () => {
    const mock = await router().resolve();
    const now = Date.now();
    const past = await mock.getFixtures(new Date(now - 26 * 3600_000), new Date(now - 3 * 3600_000));
    let ref: string | null = null;
    for (const f of past) if (await mock.getResult(f.ref)) ref ??= f.ref;
    expect(ref).toMatch(/^mock-/);
    const expected = await mock.getResult(ref!);

    const sa = await as('SUPER_ADMIN');
    await save(sa.auth, { provider: 'api-football', apiKey: FAKE_KEY }).expect(200);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network calls expected'));
    expect((await router().resolve()).name).toBe('api-football');
    expect(await router().getResult(ref!)).toEqual(expected);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
