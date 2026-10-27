import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type MatchOutcome } from '@goalbet/shared';
import { ODDS_PROVIDER, type OddsProvider } from '../src/modules/api-integration/odds-provider.js';
import { SettlementService } from '../src/modules/settlement-engine/settlement.service.js';
import { fund, idemKey, seedEvent, seedGoalMarkets, setSetting } from './fixtures.js';
import { type TestContext, createTestApp, registerPlayer, resetDb } from './helpers.js';

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
  player = await registerPlayer(ctx, 901);
  await fund(ctx, player.id, 10_000);
});

const quote = (eventId: string, ids: string[]) => ctx.http().get(`/catalog/builder?eventId=${eventId}&ids=${ids.join(',')}`).expect(200).then((r) => r.body);
const placeBuilder = (eventId: string, selectionIds: string[], oddsMilli: number, pref = 'ANY', stakeBani = 1000) =>
  ctx
    .http()
    .post('/bets')
    .set('Authorization', `Bearer ${player.token}`)
    .set('Idempotency-Key', idemKey())
    .send({ type: 'SINGLE', stakeBani, oddsChangePreference: pref, legs: [{ kind: 'BET_BUILDER', eventId, selectionIds, oddsMilli }] });
const balance = async () => (await ctx.prisma.wallet.findUniqueOrThrow({ where: { userId: player.id } })).balanceBani;

async function match() {
  const m = await seedEvent(ctx);
  return { ...m, ...(await seedGoalMarkets(ctx, m.event.id)) };
}

describe('F1.11 Bet Builder', () => {
  it('prices a combination of one match: product × correlation factor when the provider has no price', async () => {
    const m = await match();
    // 2.00 × 1.90 × 0.85
    expect(await quote(m.event.id, [m.home.id, m.over.id])).toMatchObject({ available: true, oddsMilli: 3230, source: 'MODEL' });
    // 2.00 × 1.90 × 1.80 × 0.85
    expect(await quote(m.event.id, [m.home.id, m.over.id, m.bttsYes.id])).toMatchObject({ available: true, oddsMilli: 5814 });

    await setSetting(ctx, 'builder.factorBps', 9000);
    expect(await quote(m.event.id, [m.home.id, m.over.id])).toMatchObject({ oddsMilli: 3420 });
  });

  it('uses the provider’s correlated price when it has one', async () => {
    const m = await match();
    vi.spyOn(ctx.app.get<OddsProvider>(ODDS_PROVIDER), 'priceBetBuilder').mockResolvedValue(3555);
    expect(await quote(m.event.id, [m.home.id, m.over.id])).toMatchObject({ available: true, oddsMilli: 3555, source: 'PROVIDER' });
  });

  it('refuses contradictions, two picks of one market, a single pick and picks from two matches', async () => {
    const m = await match();
    const other = await seedEvent(ctx);
    // a home win with both teams scoring has at least 3 goals: not under 2.5
    expect(await quote(m.event.id, [m.home.id, m.bttsYes.id, m.under.id])).toMatchObject({ available: false, reason: 'CONTRADICTION' });
    expect(await quote(m.event.id, [m.home.id, m.away.id])).toMatchObject({ available: false, reason: 'SAME_MARKET' });
    expect(await quote(m.event.id, [m.home.id])).toMatchObject({ available: false, reason: 'TOO_FEW' });
    expect(await quote(m.event.id, [m.home.id, other.away.id])).toMatchObject({ available: false, reason: 'ONE_MATCH' });
    await ctx.prisma.market.update({ where: { id: m.market.id }, data: { status: 'SUSPENDED' } });
    expect(await quote(m.event.id, [m.home.id, m.over.id])).toMatchObject({ available: false, reason: 'MARKET_SUSPENDED', selectionId: m.home.id });

    const bad = await placeBuilder(m.event.id, [m.over.id, m.bttsYes.id, other.home.id], 3000).expect(422);
    expect(bad.body.error).toMatchObject({ code: 'BUILDER_INVALID', details: { reason: 'ONE_MATCH' } });
    expect(await balance()).toBe(10_000);
  });

  it('places a builder as one leg with one price, settles it as one leg and offers cash out', async () => {
    const m = await match();
    // the price moved since the slip showed it: rejected with the new price when the player wants exact odds
    const changed = await placeBuilder(m.event.id, [m.home.id, m.over.id], 3300, 'NONE').expect(422);
    expect(changed.body.error).toMatchObject({ code: 'ODDS_CHANGED', details: { changes: [{ eventId: m.event.id, builder: true, currentOddsMilli: 3230 }] } });

    const placed = await placeBuilder(m.event.id, [m.home.id, m.over.id], 3230, 'NONE').expect(201);
    expect(placed.body).toMatchObject({ type: 'SINGLE', totalOddsMilli: 3230, potentialWinBani: 3230, status: 'ACTIVE' });
    expect(placed.body.legs).toHaveLength(1);
    expect(placed.body.legs[0]).toMatchObject({ kind: 'BET_BUILDER', oddsMilli: 3230 });
    expect(placed.body.legs[0].selections.map((s: { oddsMilli: number }) => s.oddsMilli)).toEqual([2000, 1900]);
    expect(await balance()).toBe(9_000);

    const offer = await ctx.http().get(`/tickets/${placed.body.id}/cashout`).set('Authorization', `Bearer ${player.token}`).expect(200);
    expect(offer.body).toMatchObject({ available: true, offerBani: 950 });

    // 2–1: home win and over 2.5 → the builder wins at its own price
    await ctx.prisma.event.update({ where: { id: m.event.id }, data: { status: 'FINISHED', startTime: new Date(Date.now() - 2 * 3600_000) } });
    const result: MatchOutcome = { ftHome: 2, ftAway: 1, htHome: 1, htAway: 0, corners: 9, cards: 2, players: {} };
    await ctx.app.get(SettlementService).settleEvent(m.event.id, { outcome: result, source: 'PROVIDER', actor: { type: 'SYSTEM' } });
    expect(await ctx.prisma.ticket.findUniqueOrThrow({ where: { id: placed.body.id } })).toMatchObject({ status: 'WON', payoutBani: 3230 });
    expect(await balance()).toBe(12_230);
  });

  it('a builder loses when any part loses', async () => {
    const m = await match();
    const placed = await placeBuilder(m.event.id, [m.home.id, m.over.id], 3230).expect(201);
    await ctx.prisma.event.update({ where: { id: m.event.id }, data: { status: 'FINISHED', startTime: new Date(Date.now() - 2 * 3600_000) } });
    const result: MatchOutcome = { ftHome: 1, ftAway: 0, htHome: 0, htAway: 0, corners: 4, cards: 1, players: {} };
    await ctx.app.get(SettlementService).settleEvent(m.event.id, { outcome: result, source: 'PROVIDER', actor: { type: 'SYSTEM' } });
    expect(await ctx.prisma.ticket.findUniqueOrThrow({ where: { id: placed.body.id } })).toMatchObject({ status: 'LOST', payoutBani: 0 });
  });
});
