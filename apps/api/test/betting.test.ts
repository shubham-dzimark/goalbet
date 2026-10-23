import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fund, idemKey, seedEvent, setSetting } from './fixtures.js';
import { type TestContext, createTestApp, registerPlayer, resetDb } from './helpers.js';

let ctx: TestContext;
let player: Awaited<ReturnType<typeof registerPlayer>>;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDb(ctx);
  player = await registerPlayer(ctx, 1);
});

const bet = (body: object, key: string | null = idemKey(), token = player.token) => {
  const req = ctx.http().post('/bets').set('Authorization', `Bearer ${token}`);
  if (key) req.set('Idempotency-Key', key);
  return req.send(body);
};
const single = (selectionId: string, oddsMilli: number, stakeBani = 1000, oddsChangePreference = 'NONE') => ({
  type: 'SINGLE',
  stakeBani,
  oddsChangePreference,
  legs: [{ kind: 'SELECTION', selectionId, oddsMilli }],
});
const balance = async () => (await ctx.prisma.wallet.findUniqueOrThrow({ where: { userId: player.id } })).balanceBani;

/** F1.14: a rejection never creates a ticket or moves money, and is logged as betting activity. */
async function expectRejected(res: { status: number; body: { error: { code: string } } }, code: string, balanceBefore: number) {
  expect(res.body.error?.code).toBe(code);
  expect(await balance()).toBe(balanceBefore);
  expect(await ctx.prisma.ticket.count({ where: { userId: player.id } })).toBe(0);
  expect(await ctx.prisma.betAttempt.count({ where: { userId: player.id, code } })).toBeGreaterThan(0);
  expect(await ctx.prisma.auditLog.count({ where: { action: 'BET_REJECTED', entityId: player.id } })).toBeGreaterThan(0);
}

describe('F1.15 create ticket', () => {
  it('places a pre-match single: stake deducted (STAKE), ticket ACTIVE with a 10-char code, audited', async () => {
    const { home } = await seedEvent(ctx);
    await fund(ctx, player.id, 10_000);
    const res = await bet(single(home.id, 2000, 1000)).expect(201);
    expect(res.body).toMatchObject({ status: 'ACTIVE', type: 'SINGLE', stakeBani: 1000, totalOddsMilli: 2000, potentialWinBani: 2000 });
    expect(res.body.code).toMatch(/^[A-Z2-9]{10}$/);
    expect(await balance()).toBe(9000);
    const tx = await ctx.prisma.walletTransaction.findFirstOrThrow({ where: { type: 'STAKE' } });
    expect(tx).toMatchObject({ amountBani: -1000, balanceAfterBani: 9000, ticketId: res.body.id });
    expect(await ctx.prisma.auditLog.count({ where: { action: 'BET_PLACED', entityId: res.body.id } })).toBe(1);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'WALLET_STAKE' } })).toBe(1);
  });

  it('F1.10 accumulator over several matches multiplies the odds; one selection per match', async () => {
    const a = await seedEvent(ctx, { odds: [1850, 3400, 4200] });
    const b = await seedEvent(ctx, { odds: [2100, 3300, 3500] });
    await fund(ctx, player.id, 10_000);
    const res = await bet({
      type: 'ACCA',
      stakeBani: 1000,
      oddsChangePreference: 'NONE',
      legs: [
        { kind: 'SELECTION', selectionId: a.home.id, oddsMilli: 1850 },
        { kind: 'SELECTION', selectionId: b.home.id, oddsMilli: 2100 },
      ],
    }).expect(201);
    expect(res.body).toMatchObject({ type: 'ACCA', totalOddsMilli: 3885, potentialWinBani: 3885 });
    expect(res.body.legs).toHaveLength(2);

    const dup = await bet({
      type: 'ACCA',
      stakeBani: 1000,
      legs: [
        { kind: 'SELECTION', selectionId: a.home.id, oddsMilli: 1850 },
        { kind: 'SELECTION', selectionId: a.draw.id, oddsMilli: 3400 },
      ],
    });
    expect(dup.body.error.code).toBe('DUPLICATE_EVENT');
  });

  it('live bets wait the bet delay, are re-validated and become LIVE', async () => {
    await setSetting(ctx, 'betting.liveDelayMs', 300);
    const { home } = await seedEvent(ctx, { status: 'LIVE', startInMin: -30 });
    await fund(ctx, player.id, 5000);
    const t0 = Date.now();
    const res = await bet(single(home.id, 2000)).expect(201);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(300);
    expect(res.body.status).toBe('LIVE');
    expect(res.body.isLive).toBe(true);
  });

  it('live bet: odds moving during the delay → rejected, nothing charged', async () => {
    await setSetting(ctx, 'betting.liveDelayMs', 600);
    const { home } = await seedEvent(ctx, { status: 'LIVE', startInMin: -30 });
    await fund(ctx, player.id, 5000);
    const pending = bet(single(home.id, 2000));
    await new Promise((r) => setTimeout(r, 150));
    await ctx.prisma.selection.update({ where: { id: home.id }, data: { odds: '1.800' } });
    const res = await pending;
    await expectRejected(res, 'ODDS_CHANGED', 5000);
  });

  it('Idempotency-Key: required, and a retry returns the same ticket without charging twice', async () => {
    const { home } = await seedEvent(ctx);
    await fund(ctx, player.id, 5000);
    const missing = await bet(single(home.id, 2000), null).expect(400);
    expect(missing.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const key = idemKey();
    const first = await bet(single(home.id, 2000), key).expect(201);
    const retry = await bet(single(home.id, 2000), key).expect(201);
    expect(retry.body.id).toBe(first.body.id);
    expect(await balance()).toBe(4000);
    const conflict = await bet(single(home.id, 2000, 500), key).expect(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('wallet row lock: two parallel bets cannot overdraw the balance', async () => {
    const { home } = await seedEvent(ctx);
    await fund(ctx, player.id, 10_000);
    const results = await Promise.all([bet(single(home.id, 2000, 6000)), bet(single(home.id, 2000, 6000))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(await balance()).toBe(4000);
  });
});

describe('F1.13 validation order / F1.14 rejections (no money moved)', () => {
  it('1. user not active', async () => {
    const { home } = await seedEvent(ctx);
    await fund(ctx, player.id, 5000);
    await ctx.prisma.user.update({ where: { id: player.id }, data: { status: 'SUSPENDED' } });
    await expectRejected(await bet(single(home.id, 2000)), 'USER_NOT_ACTIVE', 5000);
  });

  it('1. self-excluded', async () => {
    const { home } = await seedEvent(ctx);
    await fund(ctx, player.id, 5000);
    await ctx.http().post('/me/self-exclusion').set('Authorization', `Bearer ${player.token}`).send({ days: 7 }).expect(201);
    const res = await bet(single(home.id, 2000));
    await expectRejected(res, 'SELF_EXCLUDED', 5000);
    expect(res.body.error.details.until).toBeTypeOf('string');
  });

  it('2. market status: suspended market, suspended event, disabled league, started event, unknown selection', async () => {
    await fund(ctx, player.id, 5000);
    const s1 = await seedEvent(ctx);
    await ctx.prisma.market.update({ where: { id: s1.market.id }, data: { status: 'SUSPENDED' } });
    await expectRejected(await bet(single(s1.home.id, 2000)), 'MARKET_SUSPENDED', 5000);

    const s2 = await seedEvent(ctx);
    await ctx.prisma.event.update({ where: { id: s2.event.id }, data: { suspended: true } });
    expect((await bet(single(s2.home.id, 2000))).body.error.code).toBe('EVENT_SUSPENDED');

    const s3 = await seedEvent(ctx);
    await ctx.prisma.competition.update({ where: { id: s3.competitionId }, data: { enabled: false } });
    expect((await bet(single(s3.home.id, 2000))).body.error.code).toBe('LEAGUE_DISABLED');

    const s4 = await seedEvent(ctx, { startInMin: -5 }); // kicked off but feed has not said LIVE yet
    expect((await bet(single(s4.home.id, 2000))).body.error.code).toBe('EVENT_NOT_AVAILABLE');

    const s5 = await seedEvent(ctx);
    await ctx.prisma.marketTypeSetting.create({ data: { type: 'MATCH_RESULT', enabled: false } });
    expect((await bet(single(s5.home.id, 2000))).body.error.code).toBe('MARKET_CLOSED');

    expect((await bet(single('00000000-0000-7000-8000-000000000000', 2000))).body.error.code).toBe('SELECTION_NOT_FOUND');
    expect(await balance()).toBe(5000);
  });

  it('3. latest odds vs submitted odds, per odds-change preference', async () => {
    const { home } = await seedEvent(ctx);
    await fund(ctx, player.id, 5000);
    const res = await bet(single(home.id, 1900, 1000, 'NONE'));
    await expectRejected(res, 'ODDS_CHANGED', 5000);
    expect(res.body.error.details.changes).toEqual([{ selectionId: home.id, submittedOddsMilli: 1900, currentOddsMilli: 2000 }]);

    // "higher only": a better price is accepted at the server's current odds…
    const higher = await bet(single(home.id, 1900, 1000, 'HIGHER')).expect(201);
    expect(higher.body.totalOddsMilli).toBe(2000);
    // …a worse one is not
    expect((await bet(single(home.id, 2100, 1000, 'HIGHER'))).body.error.code).toBe('ODDS_CHANGED');
    // "any": accepts the drop at the server price
    const any = await bet(single(home.id, 2100, 1000, 'ANY')).expect(201);
    expect(any.body.totalOddsMilli).toBe(2000);
  });

  it('4. bet limits: min/max stake, max payout, player limits', async () => {
    const { home, away } = await seedEvent(ctx);
    await fund(ctx, player.id, 2_000_000);
    expect((await bet(single(home.id, 2000, 50))).body.error).toMatchObject({ code: 'STAKE_TOO_LOW', details: { minBani: 100 } });
    expect((await bet(single(home.id, 2000, 1_000_001))).body.error.code).toBe('STAKE_TOO_HIGH');
    await setSetting(ctx, 'betting.maxPayoutBani', 10_000);
    expect((await bet(single(away.id, 3800, 3000))).body.error.code).toBe('MAX_PAYOUT_EXCEEDED');
    await setSetting(ctx, 'betting.maxPayoutBani', 50_000_000);

    const auth = { Authorization: `Bearer ${player.token}` };
    await ctx.http().put('/me/limits').set(auth).send({ type: 'MAX_STAKE_PER_BET', amountBani: 2000 }).expect(200);
    expect((await bet(single(home.id, 2000, 2500))).body.error).toMatchObject({ code: 'USER_LIMIT_EXCEEDED', details: { limit: 'MAX_STAKE_PER_BET' } });

    await ctx.http().put('/me/limits').set(auth).send({ type: 'DAILY_STAKE', amountBani: 3000 }).expect(200);
    await bet(single(home.id, 2000, 2000)).expect(201);
    expect((await bet(single(home.id, 2000, 1500))).body.error).toMatchObject({ code: 'USER_LIMIT_EXCEEDED', details: { limit: 'DAILY_STAKE' } });

    // admin-set per-user limit applies too (strictest wins)
    await ctx.prisma.userLimit.create({ data: { userId: player.id, type: 'MAX_STAKE_PER_BET', source: 'ADMIN', amountBani: 500 } });
    expect((await bet(single(home.id, 2000, 600))).body.error.details.maxBani).toBe(500);
  });

  it('5. enough balance', async () => {
    const { home } = await seedEvent(ctx);
    await fund(ctx, player.id, 500);
    await expectRejected(await bet(single(home.id, 2000, 1000)), 'INSUFFICIENT_BALANCE', 500);
  });

  it('checks run in flow-chart order (earlier failures win)', async () => {
    const { home, market } = await seedEvent(ctx);
    // no money + changed odds → odds check comes first
    expect((await bet(single(home.id, 1500))).body.error.code).toBe('ODDS_CHANGED');
    // + suspended market → market status comes before odds
    await ctx.prisma.market.update({ where: { id: market.id }, data: { status: 'SUSPENDED' } });
    expect((await bet(single(home.id, 1500))).body.error.code).toBe('MARKET_SUSPENDED');
    // + self-exclusion → user check comes first
    await ctx.prisma.selfExclusion.create({ data: { userId: player.id, endsAt: null } });
    expect((await bet(single(home.id, 1500))).body.error.code).toBe('SELF_EXCLUDED');
  });
});

describe('F1.4 account dashboard', () => {
  it('shows RON balance, open tickets, stakes in play and recent activity', async () => {
    const { home } = await seedEvent(ctx);
    await fund(ctx, player.id, 5000);
    await bet(single(home.id, 2000, 1500)).expect(201);
    const res = await ctx.http().get('/me/dashboard').set('Authorization', `Bearer ${player.token}`).expect(200);
    expect(res.body).toMatchObject({ openTickets: 1, openStakeBani: 1500, openPotentialWinBani: 3000, selfExclusion: null });
    expect(res.body.user.balanceBani).toBe(3500);
    expect(res.body.recentTransactions.map((t: { type: string }) => t.type)).toEqual(['STAKE', 'ADMIN_CREDIT']);
  });
});

describe('F1.4 responsible gambling limits', () => {
  it('lowering applies at once; raising waits 24 h', async () => {
    const auth = { Authorization: `Bearer ${player.token}` };
    await ctx.http().put('/me/limits').set(auth).send({ type: 'DAILY_STAKE', amountBani: 5000 }).expect(200);
    const raised = await ctx.http().put('/me/limits').set(auth).send({ type: 'DAILY_STAKE', amountBani: 9000 }).expect(200);
    expect(raised.body[0]).toMatchObject({ amountBani: 5000, pendingAmountBani: 9000 });
    const lowered = await ctx.http().put('/me/limits').set(auth).send({ type: 'DAILY_STAKE', amountBani: 1000 }).expect(200);
    expect(lowered.body[0]).toMatchObject({ amountBani: 1000, pendingAmountBani: null });
  });
});

describe('F1.7 My Bets / F1.8 wallet history', () => {
  it('lists tickets per tab and wallet transactions with filters', async () => {
    const { home } = await seedEvent(ctx);
    await fund(ctx, player.id, 5000);
    const t = await bet(single(home.id, 2000)).expect(201);
    const auth = { Authorization: `Bearer ${player.token}` };
    const active = await ctx.http().get('/tickets?tab=active').set(auth).expect(200);
    expect(active.body.items.map((x: { id: string }) => x.id)).toEqual([t.body.id]);
    expect((await ctx.http().get('/tickets?tab=settled').set(auth).expect(200)).body.items).toEqual([]);
    const detail = await ctx.http().get(`/tickets/${t.body.id}`).set(auth).expect(200);
    expect(detail.body.legs[0].selections[0]).toMatchObject({ marketType: 'MATCH_RESULT', outcome: 'HOME', oddsMilli: 2000 });

    const all = await ctx.http().get('/wallet/transactions').set(auth).expect(200);
    expect(all.body.items.map((x: { type: string }) => x.type)).toEqual(['STAKE', 'ADMIN_CREDIT']);
    expect(all.body.items[0]).toMatchObject({ amountBani: -1000, balanceAfterBani: 4000, ticketCode: t.body.code });
    const stakes = await ctx.http().get('/wallet/transactions?type=STAKE').set(auth).expect(200);
    expect(stakes.body.items).toHaveLength(1);
    const future = await ctx.http().get('/wallet/transactions?from=2099-01-01').set(auth).expect(200);
    expect(future.body.items).toHaveLength(0);

    // other players cannot read the ticket
    const other = await registerPlayer(ctx, 2);
    await ctx.http().get(`/tickets/${t.body.id}`).set('Authorization', `Bearer ${other.token}`).expect(404);
  });
});

describe('ledger reconciliation (rule 2)', () => {
  it('balance always equals the sum of transactions; tampering is detected', async () => {
    const { home } = await seedEvent(ctx);
    await fund(ctx, player.id, 5000);
    await bet(single(home.id, 2000)).expect(201);
    const { WalletService } = await import('../src/modules/wallet-ledger/wallet.service.js');
    const wallet = ctx.app.get(WalletService);
    expect(await wallet.reconcile()).toMatchObject({ mismatches: 0 });
    await ctx.prisma.wallet.update({ where: { userId: player.id }, data: { balanceBani: 999_999 } });
    expect(await wallet.reconcile()).toMatchObject({ mismatches: 1 });
    expect(await ctx.prisma.auditLog.count({ where: { action: 'LEDGER_MISMATCH' } })).toBe(1);
  });
});
