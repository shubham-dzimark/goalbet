import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fund, idemKey, seedEvent, setSetting } from './fixtures.js';
import { type TestContext, adminLogin, createAdmin, createTestApp, registerPlayer, resetDb } from './helpers.js';

let ctx: TestContext;
let op: Record<string, string>;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDb(ctx);
  await setSetting(ctx, 'betting.liveDelayMs', 0);
  op = { Authorization: `Bearer ${await adminLogin(ctx, await createAdmin(ctx, 'OPERATOR'))}` };
});

const bet = (token: string, legs: { selectionId: string; oddsMilli: number }[], stakeBani = 1000) =>
  ctx
    .http()
    .post('/bets')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', idemKey())
    .send({ type: legs.length > 1 ? 'ACCA' : 'SINGLE', stakeBani, oddsChangePreference: 'ANY', legs: legs.map((l) => ({ kind: 'SELECTION', ...l })) })
    .expect(201)
    .then((r) => r.body as { id: string });
const result = (ft: [number, number], extra: object = {}) => ({
  ftHome: ft[0],
  ftAway: ft[1],
  htHome: 0,
  htAway: 0,
  corners: 9,
  cards: 3,
  reason: 'E2E result',
  ...extra,
});
const settle = (eventId: string, body: object) => ctx.http().post(`/admin/sportsbook/events/${eventId}/settle`).set(op).send(body);
const resettle = (eventId: string, body: object) => ctx.http().post(`/admin/sportsbook/events/${eventId}/resettle`).set(op).send(body);
const started = (eventId: string) => ctx.prisma.event.update({ where: { id: eventId }, data: { startTime: new Date(Date.now() - 3 * 3600_000) } });
const ticket = (id: string) => ctx.prisma.ticket.findUniqueOrThrow({ where: { id } });
const balance = async (userId: string) => (await ctx.prisma.wallet.findUniqueOrThrow({ where: { userId } })).balanceBani;

describe('F2.9 manual settlement with scorers', () => {
  it('settles scorer bets for the players the operator lists; players left out are void', async () => {
    const m = await seedEvent(ctx);
    await ctx.prisma.event.update({
      where: { id: m.event.id },
      data: { players: [{ ref: 'p1', name: 'Ion Pop', team: 'HOME' }, { ref: 'p2', name: 'Dan Ene', team: 'AWAY' }, { ref: 'p3', name: 'Bench', team: 'AWAY' }] },
    });
    const scorers = await ctx.prisma.market.create({
      data: {
        eventId: m.event.id,
        key: 'ANYTIME_SCORER|FT|||',
        type: 'ANYTIME_SCORER',
        period: 'FT',
        selections: { create: [{ outcome: 'p1', label: 'Ion Pop', team: 'HOME', odds: '3.000' }, { outcome: 'p2', label: 'Dan Ene', team: 'AWAY', odds: '4.000' }] },
      },
      include: { selections: { orderBy: { outcome: 'asc' } } },
    });
    const [p1, p2] = scorers.selections;
    const pl = await registerPlayer(ctx, 971);
    await fund(ctx, pl.id, 5_000);
    const t1 = await bet(pl.token, [{ selectionId: p1!.id, oddsMilli: 3000 }]);
    const t2 = await bet(pl.token, [{ selectionId: p2!.id, oddsMilli: 4000 }]);
    await started(m.event.id);

    const players = (await ctx.http().get(`/admin/sportsbook/events/${m.event.id}/players`).set(op).expect(200)).body;
    expect(players.map((x: { ref: string; openBets: number }) => [x.ref, x.openBets])).toEqual([['p1', 1], ['p2', 1]]);

    expect((await settle(m.event.id, result([1, 0], { players: [{ ref: 'p1', goals: 2, shots: 3 }] })).expect(422)).body.error.code).toBe('SCORER_GOALS_EXCEED_SCORE');
    await settle(m.event.id, result([1, 0], { players: [{ ref: 'p1', goals: 1, shots: 3 }] })).expect(200);
    expect(await ticket(t1.id)).toMatchObject({ status: 'WON', payoutBani: 3000 });
    // p2 not listed as having played: void, stake back
    expect(await ticket(t2.id)).toMatchObject({ status: 'VOID', payoutBani: 1000 });
    expect(await balance(pl.id)).toBe(7_000);
  });
});

describe('F2.9 re-settlement (correcting a settled match)', () => {
  it('pays the difference both ways, reopens or closes accumulators, versions the record', async () => {
    const m = await seedEvent(ctx);
    const other = await seedEvent(ctx);
    const pl = await registerPlayer(ctx, 972);
    await fund(ctx, pl.id, 10_000);
    const home = await bet(pl.token, [{ selectionId: m.home.id, oddsMilli: 2000 }]);
    const away = await bet(pl.token, [{ selectionId: m.away.id, oddsMilli: 3800 }]);
    const acca = await bet(pl.token, [{ selectionId: m.away.id, oddsMilli: 3800 }, { selectionId: other.home.id, oddsMilli: 2000 }]);
    await started(m.event.id);

    await settle(m.event.id, result([2, 1])).expect(200);
    expect(await ticket(home.id)).toMatchObject({ status: 'WON', payoutBani: 2000 });
    expect(await ticket(away.id)).toMatchObject({ status: 'LOST' });
    expect(await ticket(acca.id)).toMatchObject({ status: 'LOST' });
    expect(await balance(pl.id)).toBe(9_000);

    // the real result was 0–1
    const res = await resettle(m.event.id, result([0, 1], { reason: 'Wrong score entered' })).expect(200);
    expect(res.body).toMatchObject({ version: 2, ticketsChanged: 3, creditedBani: 3800, debitedBani: 2000 });
    expect(await ticket(home.id)).toMatchObject({ status: 'LOST', payoutBani: 0 });
    expect(await ticket(away.id)).toMatchObject({ status: 'WON', payoutBani: 3800 });
    // the accumulator's other match is still to play: it is open again
    expect(await ticket(acca.id)).toMatchObject({ status: 'ACTIVE', payoutBani: null });
    expect(await balance(pl.id)).toBe(10_800);
    expect(await ctx.prisma.walletTransaction.findFirstOrThrow({ where: { ticketId: home.id, type: 'VOID_REVERSAL' } })).toMatchObject({ amountBani: -2000 });
    expect(await ctx.prisma.settlementRecord.findFirstOrThrow({ where: { eventId: m.event.id, version: 2 } })).toMatchObject({ source: 'ADMIN_RESETTLE', reason: 'Wrong score entered' });
    expect(await ctx.prisma.auditLog.count({ where: { action: 'EVENT_RESETTLED', entityId: m.event.id } })).toBe(1);
    expect(await ctx.prisma.event.findUniqueOrThrow({ where: { id: m.event.id } })).toMatchObject({ homeScore: 0, awayScore: 1 });

    const { WalletService } = await import('../src/modules/wallet-ledger/wallet.service.js');
    expect(await ctx.app.get(WalletService).reconcile()).toMatchObject({ ledgerMismatches: 0 });
  });

  it('changes nothing when a player no longer has the winnings to take back', async () => {
    const m = await seedEvent(ctx);
    const next = await seedEvent(ctx);
    const pl = await registerPlayer(ctx, 973);
    await fund(ctx, pl.id, 1_000);
    const t = await bet(pl.token, [{ selectionId: m.home.id, oddsMilli: 2000 }]);
    await started(m.event.id);
    await settle(m.event.id, result([1, 0])).expect(200);
    // the 20 RON won are staked again straight away
    await bet(pl.token, [{ selectionId: next.home.id, oddsMilli: 2000 }], 2000);
    expect(await balance(pl.id)).toBe(0);

    const refused = await resettle(m.event.id, result([0, 0], { reason: 'Goal disallowed' })).expect(422);
    expect(refused.body.error).toMatchObject({ code: 'RESETTLE_INSUFFICIENT_FUNDS' });
    expect(refused.body.error.details.players).toEqual([expect.objectContaining({ userId: pl.id, amountBani: 2000 })]);
    expect(await ticket(t.id)).toMatchObject({ status: 'WON', payoutBani: 2000 });
    expect(await ctx.prisma.settlementRecord.count({ where: { eventId: m.event.id } })).toBe(1);
  });

  it('only settled matches can be re-settled, and only by operators', async () => {
    const m = await seedEvent(ctx);
    await started(m.event.id);
    expect((await resettle(m.event.id, result([1, 0])).expect(422)).body.error.code).toBe('EVENT_NOT_SETTLED');
    const fin = { Authorization: `Bearer ${await adminLogin(ctx, await createAdmin(ctx, 'FINANCE'))}` };
    await ctx.http().post(`/admin/sportsbook/events/${m.event.id}/resettle`).set(fin).send(result([1, 0])).expect(403);
  });
});
