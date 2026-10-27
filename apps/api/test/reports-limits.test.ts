import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fund, idemKey, seedEvent, seedGoalMarkets, setSetting } from './fixtures.js';
import { type TestContext, adminLogin, createAdmin, createTestApp, registerPlayer, resetDb } from './helpers.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDb(ctx);
  await setSetting(ctx, 'betting.liveDelayMs', 0);
});

const deposit = (token: string, amountBani: number) =>
  ctx.http().post('/wallet/requests').set('Authorization', `Bearer ${token}`).send({ type: 'DEPOSIT', method: 'BANK_TRANSFER', amountBani });

describe('player deposit limits (responsible gambling)', () => {
  it('counts waiting and paid deposits in the window; lowering applies at once, raising waits', async () => {
    const p = await registerPlayer(ctx, 951);
    const auth = { Authorization: `Bearer ${p.token}` };
    await ctx.http().put('/me/limits').set(auth).send({ type: 'DAILY_DEPOSIT', amountBani: 10_000 }).expect(200);

    const first = await deposit(p.token, 6_000).expect(201);
    const over = await deposit(p.token, 5_000).expect(422);
    expect(over.body.error).toMatchObject({ code: 'DEPOSIT_LIMIT_EXCEEDED', details: { limit: 'DAILY_DEPOSIT', maxBani: 10_000, usedBani: 6_000 } });
    await deposit(p.token, 4_000).expect(201);

    // a cancelled request no longer counts
    await ctx.http().post(`/wallet/requests/${first.body.id}/cancel`).set(auth).expect(200);
    await deposit(p.token, 5_000).expect(201);

    // raising the limit waits for the cooling-off period
    await ctx.http().put('/me/limits').set(auth).send({ type: 'DAILY_DEPOSIT', amountBani: 50_000 }).expect(200);
    expect((await deposit(p.token, 2_000).expect(422)).body.error.code).toBe('DEPOSIT_LIMIT_EXCEEDED');

    // an operator limit applies too: the strictest wins
    await ctx.http().put('/me/limits').set(auth).send({ type: 'MONTHLY_DEPOSIT', amountBani: null }).expect(200);
    await ctx.prisma.userLimit.create({ data: { userId: p.id, type: 'MONTHLY_DEPOSIT', source: 'ADMIN', amountBani: 9_000 } });
    // 9,000 waiting + 1,000 fits the daily 10,000 but not the operator's monthly 9,000
    expect((await deposit(p.token, 1_000).expect(422)).body.error.details).toMatchObject({ limit: 'MONTHLY_DEPOSIT', maxBani: 9_000 });
  });
});

describe('F3.6 reports: bet types, payout breakdown, payments', () => {
  it('splits tickets by type, payouts by kind, and reports deposits / withdrawals and the Finance queue', async () => {
    const p = await registerPlayer(ctx, 952);
    const auth = { Authorization: `Bearer ${p.token}` };
    await fund(ctx, p.id, 20_000);
    const m = await seedEvent(ctx);
    const goals = await seedGoalMarkets(ctx, m.event.id);
    const other = await seedEvent(ctx);
    const bet = (body: object) => ctx.http().post('/bets').set(auth).set('Idempotency-Key', idemKey()).send({ oddsChangePreference: 'ANY', ...body }).expect(201);
    const single = await bet({ type: 'SINGLE', stakeBani: 1000, legs: [{ kind: 'SELECTION', selectionId: m.home.id, oddsMilli: 2000 }] });
    await bet({ type: 'ACCA', stakeBani: 500, legs: [{ kind: 'SELECTION', selectionId: m.draw.id, oddsMilli: 3200 }, { kind: 'SELECTION', selectionId: other.home.id, oddsMilli: 2000 }] });
    await bet({ type: 'SINGLE', stakeBani: 300, legs: [{ kind: 'BET_BUILDER', eventId: m.event.id, selectionIds: [m.home.id, goals.over.id], oddsMilli: 3230 }] });
    await ctx.http().post(`/tickets/${single.body.id}/cashout`).set(auth).set('Idempotency-Key', idemKey()).send({ offerBani: 950 }).expect(200);

    const fin = await createAdmin(ctx, 'FINANCE');
    const finAuth = { Authorization: `Bearer ${await adminLogin(ctx, fin)}` };
    const dep = await deposit(p.token, 5_000).expect(201);
    await ctx.http().post(`/admin/payment-requests/${dep.body.id}/approve`).set(finAuth).send({}).expect(200);
    await ctx.http().post('/wallet/requests').set(auth).send({ type: 'WITHDRAWAL', method: 'CASH_AT_SHOP', amountBani: 3_000 }).expect(201);

    const r = (await ctx.http().get('/admin/reports').set(finAuth).expect(200)).body;
    expect(r.byBetType).toEqual([
      { type: 'SINGLE', tickets: 1, stakesBani: 1000 },
      { type: 'ACCA', tickets: 1, stakesBani: 500 },
      { type: 'BET_BUILDER', tickets: 1, stakesBani: 300 },
    ]);
    expect(r.payouts).toMatchObject({ cashOutsBani: 950, cashOuts: 1, winsBani: 0, refundsBani: 0 });
    expect(r.payments.byMethod).toEqual([{ type: 'DEPOSIT', method: 'BANK_TRANSFER', requests: 1, amountBani: 5_000 }]);
    expect(r.payments.queue).toMatchObject({ deposits: 0, withdrawals: 1, pendingBani: 3_000 });
    expect(r.payments.queue.oldestAt).not.toBeNull();
    expect(r.payments.avgDecisionMinutes).toBe(0);
    expect(r.payments.daily.at(-1)).toMatchObject({ depositsBani: 5_000, withdrawalsBani: 0 });
  });
});
