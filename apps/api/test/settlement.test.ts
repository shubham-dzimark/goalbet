import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type MatchOutcome } from '@goalbet/shared';
import { ODDS_PROVIDER, type OddsProvider } from '../src/modules/api-integration/odds-provider.js';
import { SettlementService } from '../src/modules/settlement-engine/settlement.service.js';
import { WalletService } from '../src/modules/wallet-ledger/wallet.service.js';
import { fund, idemKey, seedEvent, setSetting } from './fixtures.js';
import { type TestContext, adminLogin, createAdmin, createTestApp, registerPlayer, resetDb } from './helpers.js';

let ctx: TestContext;
let player: Awaited<ReturnType<typeof registerPlayer>>;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDb(ctx);
  vi.restoreAllMocks();
  await setSetting(ctx, 'betting.liveDelayMs', 0);
  player = await registerPlayer(ctx, 801);
  await fund(ctx, player.id, 10_000);
});

const auth = () => ({ Authorization: `Bearer ${player.token}` });
const place = (legs: { selectionId: string; oddsMilli: number }[], stakeBani = 1000) =>
  ctx
    .http()
    .post('/bets')
    .set(auth())
    .set('Idempotency-Key', idemKey())
    .send({ type: legs.length > 1 ? 'ACCA' : 'SINGLE', stakeBani, oddsChangePreference: 'ANY', legs: legs.map((l) => ({ kind: 'SELECTION', ...l })) })
    .expect(201)
    .then((r) => r.body as { id: string; status: string });

const score = (ftHome: number, ftAway: number, extra: Partial<MatchOutcome> = {}): MatchOutcome => ({
  ftHome,
  ftAway,
  htHome: 0,
  htAway: 0,
  corners: 8,
  cards: 3,
  players: {},
  ...extra,
});
/** The match was played: kick-off in the past, final whistle from the feed. */
const finish = (eventId: string, status: 'FINISHED' | 'CANCELLED' = 'FINISHED') =>
  ctx.prisma.event.update({ where: { id: eventId }, data: { status, startTime: new Date(Date.now() - 2 * 3600_000) } });
const balance = async () => (await ctx.prisma.wallet.findUniqueOrThrow({ where: { userId: player.id } })).balanceBani;
const ticket = (id: string) => ctx.prisma.ticket.findUniqueOrThrow({ where: { id } });
const provideResults = (byRef: Record<string, MatchOutcome & { status?: 'FINISHED' | 'CANCELLED' }>) => {
  const provider = ctx.app.get<OddsProvider>(ODDS_PROVIDER);
  vi.spyOn(provider, 'getResult').mockImplementation(async (ref) => {
    const r = byRef[ref];
    return r ? { ref, status: r.status ?? 'FINISHED', outcome: r } : null;
  });
};

describe('F2.8–F2.11 automatic settlement', () => {
  it('grades selections, pays winners once and leaves accumulators open until every leg is decided', async () => {
    const a = await seedEvent(ctx);
    const b = await seedEvent(ctx);
    const win = await place([{ selectionId: a.home.id, oddsMilli: 2000 }]);
    const lose = await place([{ selectionId: a.away.id, oddsMilli: 3800 }]);
    const acca = await place([
      { selectionId: a.home.id, oddsMilli: 2000 },
      { selectionId: b.draw.id, oddsMilli: 3200 },
    ]);
    expect(await balance()).toBe(7_000);

    await finish(a.event.id);
    provideResults({ [a.event.providerRef]: score(2, 1) });
    const service = ctx.app.get(SettlementService);
    expect(await service.settlePending()).toMatchObject({ settled: 1, failed: 0 });

    expect(await ticket(win.id)).toMatchObject({ status: 'WON', payoutBani: 2000 });
    expect(await ticket(lose.id)).toMatchObject({ status: 'LOST', payoutBani: 0 });
    expect((await ticket(acca.id)).status).toBe('ACTIVE');
    expect(await balance()).toBe(9_000);
    expect((await ctx.prisma.selection.findUniqueOrThrow({ where: { id: a.draw.id } })).result).toBe('LOST');
    expect((await ctx.prisma.market.findUniqueOrThrow({ where: { id: a.market.id } })).status).toBe('SETTLED');
    expect(await ctx.prisma.settlementRecord.findFirst({ where: { eventId: a.event.id } })).toMatchObject({ version: 1, source: 'PROVIDER', ticketsSettled: 2 });
    expect((await ctx.prisma.event.findUniqueOrThrow({ where: { id: a.event.id } })).settledAt).not.toBeNull();

    // the second match decides the accumulator: 1000 × 2.000 × 3.200
    await finish(b.event.id);
    provideResults({ [b.event.providerRef]: score(1, 1) });
    await service.settlePending();
    expect(await ticket(acca.id)).toMatchObject({ status: 'WON', payoutBani: 6400 });
    expect(await balance()).toBe(15_400);

    // nothing is settled or paid twice
    expect(await service.settlePending()).toMatchObject({ settled: 0 });
    await expect(service.settleEvent(a.event.id, { outcome: score(2, 1), source: 'PROVIDER', actor: { type: 'SYSTEM' } })).rejects.toMatchObject({
      code: 'EVENT_ALREADY_SETTLED',
    });
    expect(await ctx.prisma.walletTransaction.count({ where: { type: 'WIN' } })).toBe(2);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'EVENT_SETTLED' } })).toBe(2);
    expect(await ctx.app.get(WalletService).reconcile()).toMatchObject({ ledgerMismatches: 0, holdMismatches: 0 });
  });

  it('a lost leg settles an accumulator at once; a cancelled match refunds singles', async () => {
    const a = await seedEvent(ctx);
    const b = await seedEvent(ctx);
    const acca = await place([
      { selectionId: a.home.id, oddsMilli: 2000 },
      { selectionId: b.home.id, oddsMilli: 2000 },
    ]);
    const single = await place([{ selectionId: b.away.id, oddsMilli: 3800 }], 500);

    await finish(a.event.id);
    await finish(b.event.id, 'CANCELLED');
    provideResults({ [a.event.providerRef]: score(0, 1), [b.event.providerRef]: { ...score(0, 0), status: 'CANCELLED' } });
    expect(await ctx.app.get(SettlementService).settlePending()).toMatchObject({ settled: 2 });

    expect(await ticket(acca.id)).toMatchObject({ status: 'LOST', payoutBani: 0 });
    expect(await ticket(single.id)).toMatchObject({ status: 'VOID', payoutBani: 500 });
    const refund = await ctx.prisma.walletTransaction.findFirstOrThrow({ where: { type: 'REFUND' } });
    expect(refund).toMatchObject({ amountBani: 500, ticketId: single.id, uniqueRef: `REFUND:${single.id}` });
    expect(await balance()).toBe(9_000);
  });

  it('waits while the provider has no result', async () => {
    const a = await seedEvent(ctx);
    await place([{ selectionId: a.home.id, oddsMilli: 2000 }]);
    await finish(a.event.id);
    provideResults({});
    expect(await ctx.app.get(SettlementService).settlePending()).toMatchObject({ settled: 0, waiting: 1 });
  });

  it('also settles overdue matches the feed never finished, when they carry open bets', async () => {
    const a = await seedEvent(ctx);
    const quiet = await seedEvent(ctx);
    const t = await place([{ selectionId: a.home.id, oddsMilli: 2000 }]);
    const overdue = new Date(Date.now() - 4 * 3600_000);
    await ctx.prisma.event.updateMany({ where: { id: { in: [a.event.id, quiet.event.id] } }, data: { startTime: overdue } });
    provideResults({ [a.event.providerRef]: score(1, 0), [quiet.event.providerRef]: score(0, 0) });
    // the match without bets is not worth a provider call
    expect(await ctx.app.get(SettlementService).settlePending()).toMatchObject({ settled: 1, waiting: 0 });
    expect(await ticket(t.id)).toMatchObject({ status: 'WON', payoutBani: 2000 });
    expect((await ctx.prisma.event.findUniqueOrThrow({ where: { id: a.event.id } })).status).toBe('FINISHED');
    expect((await ctx.prisma.event.findUniqueOrThrow({ where: { id: quiet.event.id } })).settledAt).toBeNull();
  });
});

describe('F2.9 manual settlement (admin)', () => {
  it('an operator settles an overdue match with an entered result; it then leaves the awaiting list', async () => {
    const a = await seedEvent(ctx);
    const t = await place([{ selectionId: a.draw.id, oddsMilli: 3200 }]);
    const op = { Authorization: `Bearer ${await adminLogin(ctx, await createAdmin(ctx, 'OPERATOR'))}` };
    const fin = { Authorization: `Bearer ${await adminLogin(ctx, await createAdmin(ctx, 'FINANCE'))}` };
    const result = { ftHome: 1, ftAway: 1, htHome: 1, htAway: 0, corners: 5, cards: 2, reason: 'Feed has no result' };
    const settle = (h: Record<string, string>, body: object = result) => ctx.http().post(`/admin/sportsbook/events/${a.event.id}/settle`).set(h).send(body);

    // not kicked off yet
    expect((await settle(op).expect(422)).body.error.code).toBe('SETTLEMENT_NOT_READY');
    // the feed never sent full time: overdue
    await ctx.prisma.event.update({ where: { id: a.event.id }, data: { status: 'LIVE', startTime: new Date(Date.now() - 4 * 3600_000) } });
    const awaiting = await ctx.http().get('/admin/sportsbook/events?awaitingSettlement=true').set(op).expect(200);
    expect(awaiting.body.items.map((e: { id: string }) => e.id)).toEqual([a.event.id]);
    expect((await ctx.http().get('/admin/dashboard').set(op).expect(200)).body.awaitingSettlement).toBe(1);

    await settle(fin).expect(403);
    await settle(op, { ...result, htHome: 3 }).expect(400);
    expect((await settle(op).expect(200)).body).toMatchObject({ status: 'FINISHED', ticketsSettled: 1, paidBani: 3200, version: 1 });
    expect(await ticket(t.id)).toMatchObject({ status: 'WON', payoutBani: 3200 });
    expect(await ctx.prisma.event.findUniqueOrThrow({ where: { id: a.event.id } })).toMatchObject({ homeScore: 1, awayScore: 1, period: 'FULL_TIME' });
    expect(await ctx.prisma.settlementRecord.findFirstOrThrow({ where: { eventId: a.event.id } })).toMatchObject({ source: 'ADMIN', reason: 'Feed has no result' });
    expect(await ctx.prisma.auditLog.count({ where: { action: 'EVENT_SETTLED_MANUALLY', entityId: a.event.id } })).toBe(1);

    expect((await settle(op).expect(422)).body.error.code).toBe('EVENT_ALREADY_SETTLED');
    expect((await ctx.http().get('/admin/sportsbook/events?awaitingSettlement=true').set(op).expect(200)).body.items).toHaveLength(0);
  });
});

describe('F2.3–F2.7 cash out', () => {
  const quote = (id: string) => ctx.http().get(`/tickets/${id}/cashout`).set(auth());
  const accept = (id: string, offerBani: number, key = idemKey()) =>
    ctx.http().post(`/tickets/${id}/cashout`).set(auth()).set('Idempotency-Key', key).send({ offerBani });

  it('offers stake × placed ÷ current odds less the margin, and pays it once', async () => {
    const a = await seedEvent(ctx);
    const t = await place([{ selectionId: a.home.id, oddsMilli: 2000 }]);
    const q = (await quote(t.id).expect(200)).body;
    expect(q).toMatchObject({ ticketId: t.id, available: true, offerBani: 950 });
    expect((await ctx.http().get('/cashout/offers').set(auth()).expect(200)).body).toHaveLength(1);

    const key = idemKey();
    const res = await accept(t.id, 950, key).expect(200);
    expect(res.body).toMatchObject({ status: 'CASHED_OUT', cashedOutBani: 950 });
    // a repeat with the same key replays, it does not pay again
    expect((await accept(t.id, 950, key).expect(200)).body.status).toBe('CASHED_OUT');
    expect((await accept(t.id, 950).expect(422)).body.error.code).toBe('TICKET_NOT_OPEN');
    expect(await ctx.prisma.walletTransaction.findMany({ where: { type: 'CASHOUT' } })).toHaveLength(1);
    expect(await balance()).toBe(9_950);
    expect((await quote(t.id).expect(200)).body).toMatchObject({ available: false, reason: 'NOT_OPEN' });

    // settlement grades the leg but never pays a cashed-out ticket
    await finish(a.event.id);
    provideResults({ [a.event.providerRef]: score(3, 0) });
    await ctx.app.get(SettlementService).settlePending();
    expect(await ticket(t.id)).toMatchObject({ status: 'CASHED_OUT', payoutBani: null });
    expect(await balance()).toBe(9_950);
  });

  it('a price drop beyond 1 % returns the new offer; within 1 % it is paid', async () => {
    const a = await seedEvent(ctx);
    const t = await place([{ selectionId: a.home.id, oddsMilli: 2000 }]);
    await ctx.prisma.selection.update({ where: { id: a.home.id }, data: { odds: '2.500' } });
    const changed = await accept(t.id, 950).expect(422);
    expect(changed.body.error).toMatchObject({ code: 'CASHOUT_PRICE_CHANGED', details: { offerBani: 760 } });
    expect((await ticket(t.id)).status).toBe('ACTIVE');
    // shown 765, now 760: less than 1 % lower → paid at the current offer
    expect((await accept(t.id, 765).expect(200)).body).toMatchObject({ status: 'CASHED_OUT', cashedOutBani: 760 });
  });

  it('is unavailable while suspended, after a lost leg, or when switched off', async () => {
    const a = await seedEvent(ctx);
    const t = await place([{ selectionId: a.home.id, oddsMilli: 2000 }]);
    await ctx.prisma.event.update({ where: { id: a.event.id }, data: { suspended: true } });
    expect((await quote(t.id).expect(200)).body).toMatchObject({ available: false, reason: 'MARKET_SUSPENDED' });
    expect((await accept(t.id, 950).expect(422)).body.error).toMatchObject({ code: 'CASHOUT_UNAVAILABLE', details: { reason: 'MARKET_SUSPENDED' } });
    await ctx.prisma.event.update({ where: { id: a.event.id }, data: { suspended: false } });

    // past kick-off but the feed never started it: no price, no offer
    await ctx.prisma.event.update({ where: { id: a.event.id }, data: { startTime: new Date(Date.now() - 60_000) } });
    expect((await quote(t.id).expect(200)).body).toMatchObject({ available: false, reason: 'MARKET_SUSPENDED' });
    await ctx.prisma.event.update({ where: { id: a.event.id }, data: { startTime: new Date(Date.now() + 3600_000) } });
    await ctx.prisma.competition.update({ where: { id: a.competitionId }, data: { enabled: false } });
    expect((await quote(t.id).expect(200)).body).toMatchObject({ available: false, reason: 'MARKET_SUSPENDED' });
    await ctx.prisma.competition.update({ where: { id: a.competitionId }, data: { enabled: true } });

    await setSetting(ctx, 'cashout.enabled', false);
    expect((await quote(t.id).expect(200)).body).toMatchObject({ available: false, reason: 'DISABLED' });
    await setSetting(ctx, 'cashout.enabled', true);

    const other = await registerPlayer(ctx, 802);
    await ctx.http().get(`/tickets/${t.id}/cashout`).set('Authorization', `Bearer ${other.token}`).expect(404);
  });
});

describe('reconciliation (rule 2)', () => {
  it('detects held money that does not match pending withdrawals and keeps the last report for the dashboard', async () => {
    const wallet = ctx.app.get(WalletService);
    expect(await wallet.reconcile()).toMatchObject({ ledgerMismatches: 0, holdMismatches: 0, wallets: 1 });
    await ctx.prisma.wallet.update({ where: { userId: player.id }, data: { heldBani: 300 } });
    expect(await wallet.reconcile()).toMatchObject({ ledgerMismatches: 0, holdMismatches: 1 });
    expect(await ctx.prisma.auditLog.count({ where: { action: 'HOLD_MISMATCH' } })).toBe(1);

    const op = { Authorization: `Bearer ${await adminLogin(ctx, await createAdmin(ctx, 'OPERATOR'))}` };
    const dash = (await ctx.http().get('/admin/dashboard').set(op).expect(200)).body;
    expect(dash.reconciliation).toMatchObject({ holdMismatches: 1, ledgerMismatches: 0 });
  });
});
