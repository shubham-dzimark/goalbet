import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestContext, createTestApp, registerPlayer, resetDb } from './helpers.js';

let ctx: TestContext;
let ingest: import('../src/modules/odds-management/ingest.service.js').IngestService;

beforeAll(async () => {
  ctx = await createTestApp();
  const { IngestService } = await import('../src/modules/odds-management/ingest.service.js');
  ingest = ctx.app.get(IngestService);
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

describe('F4.1 / F4.3 provider ingest into the database', () => {
  it('stores competitions, fixtures for the next 7 days, markets and live matches', async () => {
    expect(await ingest.syncCompetitions()).toBe(7);
    const now = Date.now();
    const ids = await ingest.syncFixtures(new Date(now - 4 * 3600_000), new Date(now + 7 * 24 * 3600_000));
    expect(ids.length).toBeGreaterThan(300);

    await ingest.syncLive();
    const live = await ctx.prisma.event.findMany({ where: { status: 'LIVE' } });
    expect(live.length).toBeGreaterThanOrEqual(3);
    expect(live.length).toBeLessThanOrEqual(5);
    for (const e of live) expect(e.minute).not.toBeNull();

    const liveMarkets = await ctx.prisma.market.count({ where: { eventId: { in: live.map((e) => e.id) } } });
    expect(liveMarkets).toBeGreaterThan(live.length * 10);
    const sports = await ctx.prisma.competition.findMany({ select: { name: true } });
    expect(sports).toHaveLength(7); // football only (F0.1)
  });

  it('records odds changes in OddsHistory and publishes them', async () => {
    await ingest.syncCompetitions();
    const now = Date.now();
    await ingest.syncFixtures(new Date(now - 4 * 3600_000), new Date(now + 3600_000));
    await ingest.syncLive();
    const { ODDS_PROVIDER } = await import('../src/modules/api-integration/odds-provider.js');
    // the engine sees a ProviderRouter; the test controls live on the active mock behind it
    const mock = (await (ctx.app.get(ODDS_PROVIDER) as import('../src/modules/api-integration/provider-router.js').ProviderRouter).mock())!;
    // An event stays LIVE in the DB after full time until settlement confirms it (and late in a
    // match most prices are decided), so pick an in-play event that has open selections.
    const inPlay = (await mock.getLiveStates()).filter((s) => s.status === 'LIVE').map((s) => s.ref);
    const ev = await ctx.prisma.event.findFirstOrThrow({
      where: { providerRef: { in: inPlay }, markets: { some: { selections: { some: { active: true } } } } },
    });
    await mock.setOverride(ev.providerRef, { oddsFactorBps: 13_000 });
    const msg = await ingest.syncMarkets(ev.id);
    expect(msg?.selections.length).toBeGreaterThan(0);
    expect(await ctx.prisma.oddsHistory.count()).toBeGreaterThan(0);
  });
});

describe('F2.8 match ends', () => {
  it('provider full time → event FINISHED, markets suspended, gone from the live catalogue', async () => {
    await ingest.syncCompetitions();
    const now = Date.now();
    await ingest.syncFixtures(new Date(now - 4 * 3600_000), new Date(now + 3600_000));
    await ingest.syncLive();
    const { ODDS_PROVIDER } = await import('../src/modules/api-integration/odds-provider.js');
    // the engine sees a ProviderRouter; the test controls live on the active mock behind it
    const mock = (await (ctx.app.get(ODDS_PROVIDER) as import('../src/modules/api-integration/provider-router.js').ProviderRouter).mock())!;
    const inPlay = (await mock.getLiveStates()).filter((s) => s.status === 'LIVE').map((s) => s.ref);
    const ev = await ctx.prisma.event.findFirstOrThrow({ where: { providerRef: { in: inPlay } } });

    await mock.setOverride(ev.providerRef, { finishAt: Date.now() - 1 });
    const transitions = await ingest.syncLive();
    expect(transitions).toContainEqual({ eventId: ev.id, from: 'LIVE', to: 'FINISHED' });
    const after = await ctx.prisma.event.findUniqueOrThrow({ where: { id: ev.id }, include: { markets: true } });
    expect(after.status).toBe('FINISHED');
    expect(after.markets.every((m) => m.status !== 'OPEN')).toBe(true);
    const live = await ctx.http().get('/catalog/live').expect(200);
    expect(live.body.map((e: { id: string }) => e.id)).not.toContain(ev.id);
  });
});

describe('F4.3 database guards (ledger rules)', () => {
  it('wallet balance can never go negative', async () => {
    const p = await registerPlayer(ctx, 1);
    await expect(ctx.prisma.wallet.update({ where: { userId: p.id }, data: { balanceBani: -1 } })).rejects.toThrow();
  });

  it('wallet transactions and audit logs are append-only', async () => {
    const p = await registerPlayer(ctx, 2);
    const wallet = await ctx.prisma.wallet.findUniqueOrThrow({ where: { userId: p.id } });
    const tx = await ctx.prisma.walletTransaction.create({
      data: { walletId: wallet.id, type: 'ADMIN_CREDIT', amountBani: 100, balanceAfterBani: 100, reason: 'test' },
    });
    await expect(ctx.prisma.walletTransaction.update({ where: { id: tx.id }, data: { amountBani: 999 } })).rejects.toThrow(/append-only/);
    await expect(ctx.prisma.walletTransaction.delete({ where: { id: tx.id } })).rejects.toThrow(/append-only/);
    const log = await ctx.prisma.auditLog.findFirstOrThrow();
    await expect(ctx.prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/append-only/);
  });
});

describe('F4.2 engine modules named after the chart', () => {
  it('exposes ApiIntegration, OddsManagement, BetProcessing, CashOutEngine, SettlementEngine, WalletLedger, UserManagement, AdminPanelApi', async () => {
    const { ENGINE_MODULES } = await import('../src/app.module.js');
    expect(ENGINE_MODULES.map((m) => m.name)).toEqual([
      'ApiIntegrationModule',
      'OddsManagementModule',
      'BetProcessingModule',
      'CashOutEngineModule',
      'SettlementEngineModule',
      'WalletLedgerModule',
      'UserManagementModule',
      'AdminPanelApiModule',
    ]);
  });
});

describe('concurrent market syncs (fixtures sync and pre-match refresh racing)', () => {
  it('two jobs adding the same new markets at once neither fail nor duplicate them', async () => {
    await ingest.syncCompetitions();
    const now = Date.now();
    const [eventId] = await ingest.syncFixtures(new Date(now), new Date(now + 2 * 24 * 3600_000));
    const results = await Promise.allSettled([ingest.syncMarkets(eventId!), ingest.syncMarkets(eventId!), ingest.syncMarkets(eventId!)]);
    expect(results.filter((r) => r.status === 'rejected')).toEqual([]);

    const markets = await ctx.prisma.market.findMany({ where: { eventId }, include: { _count: { select: { selections: true } } } });
    expect(markets.length).toBeGreaterThan(10);
    expect(new Set(markets.map((m) => m.key)).size).toBe(markets.length);
    expect(markets.every((m) => m._count.selections > 0)).toBe(true);
  });
});

describe('manual odds (admin pricing)', () => {
  it('a manual price holds against automatic pricing until it is handed back; only operators set it', async () => {
    const { adminLogin, createAdmin } = await import('./helpers.js');
    const { parseOddsMilli } = await import('@goalbet/shared');
    await ingest.syncCompetitions();
    const now = Date.now();
    const ids = await ingest.syncFixtures(new Date(now - 4 * 3600_000), new Date(now + 7 * 24 * 3600_000));
    // the first upcoming match the feed prices with a full-time 1X2 market
    let eventId = '';
    for (const id of ids) {
      await ingest.syncMarkets(id);
      const priced = await ctx.prisma.selection.count({ where: { market: { eventId: id, type: 'MATCH_RESULT', period: 'FT', event: { status: 'SCHEDULED' } } } });
      if (priced > 0) {
        eventId = id;
        break;
      }
    }
    expect(eventId).not.toBe('');
    const where = { market: { eventId, type: 'MATCH_RESULT' as const, period: 'FT' as const }, outcome: 'HOME' };
    const before = await ctx.prisma.selection.findFirstOrThrow({ where });
    const autoMilli = parseOddsMilli(before.odds);
    const manualMilli = autoMilli + 450;

    const op = await createAdmin(ctx, 'OPERATOR');
    const opAuth = { Authorization: `Bearer ${await adminLogin(ctx, op)}` };
    const fin = await createAdmin(ctx, 'FINANCE');
    const finAuth = { Authorization: `Bearer ${await adminLogin(ctx, fin)}` };
    const url = `/admin/sportsbook/selections/${before.id}`;

    // finance cannot price; a manual price needs odds in range
    await ctx.http().patch(url).set(finAuth).send({ manual: true, oddsMilli: manualMilli, reason: 'Trader view' }).expect(403);
    const missing = await ctx.http().patch(url).set(opAuth).send({ manual: true, reason: 'Trader view' });
    expect(missing.body.error.code).toBe('VALIDATION_FAILED');
    const tooLow = await ctx.http().patch(url).set(opAuth).send({ manual: true, oddsMilli: 1000, reason: 'Trader view' });
    expect(tooLow.body.error.code).toBe('VALIDATION_FAILED');

    const set = await ctx.http().patch(url).set(opAuth).send({ manual: true, oddsMilli: manualMilli, reason: 'Trader view' }).expect(200);
    expect(set.body.selections.find((s: { id: string }) => s.id === before.id)).toMatchObject({ manual: true, oddsMilli: manualMilli });

    // automatic pricing runs again and leaves the manual price alone
    await ingest.syncMarkets(eventId);
    const held = await ctx.prisma.selection.findUniqueOrThrow({ where: { id: before.id } });
    expect(held).toMatchObject({ manual: true });
    expect(parseOddsMilli(held.odds)).toBe(manualMilli);
    expect(await ctx.prisma.oddsHistory.count({ where: { selectionId: before.id } })).toBeGreaterThan(0);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'SELECTION_PRICE_SET', entityId: before.id } })).toBe(1);

    // handed back: the next refresh takes the selection over again
    await ctx.http().patch(url).set(opAuth).send({ manual: false, reason: 'Back to model' }).expect(200);
    await ingest.syncMarkets(eventId);
    const back = await ctx.prisma.selection.findUniqueOrThrow({ where: { id: before.id } });
    expect(back.manual).toBe(false);
    expect(parseOddsMilli(back.odds)).not.toBe(manualMilli);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'SELECTION_PRICE_AUTO', entityId: before.id } })).toBe(1);
  });
});
