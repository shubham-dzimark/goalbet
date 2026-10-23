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
    const mock = ctx.app.get(ODDS_PROVIDER) as import('../src/modules/api-integration/mock/mock.provider.js').MockProvider;
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
