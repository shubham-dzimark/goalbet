import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedEvent } from './fixtures.js';
import { type TestContext, createTestApp, resetDb } from './helpers.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

describe('catalog (F1.1, F1.5, F1.6, F1.9) — public, guests can browse', () => {
  it('home feed: live count, Top Live, Top matches, boosted odds, top competitions', async () => {
    const live = await seedEvent(ctx, { status: 'LIVE', startInMin: -20 });
    const upcoming = await seedEvent(ctx, { startInMin: 120 });
    await ctx.prisma.oddsBoost.create({ data: { selectionId: upcoming.home.id, odds: '2.400' } });

    const res = await ctx.http().get('/catalog/home').expect(200);
    expect(res.body.liveCount).toBe(1);
    expect(res.body.topLive.map((e: { id: string }) => e.id)).toEqual([live.event.id]);
    expect(res.body.topMatches.map((e: { id: string }) => e.id)).toEqual([upcoming.event.id]);
    expect(res.body.topLive[0].mainMarket.selections.map((s: { outcome: string }) => s.outcome)).toEqual(['HOME', 'DRAW', 'AWAY']);
    expect(res.body.boosted[0].selection).toMatchObject({ id: upcoming.home.id, oddsMilli: 2400, baseOddsMilli: 2000, boosted: true });
    expect(res.body.topCompetitions.length).toBe(2);
  });

  it('hides disabled competitions, disabled markets and started-but-not-live events', async () => {
    const a = await seedEvent(ctx);
    const b = await seedEvent(ctx);
    await seedEvent(ctx, { startInMin: -10 });
    await ctx.prisma.competition.update({ where: { id: b.competitionId }, data: { enabled: false } });
    const countries = await ctx.http().get('/catalog/countries').expect(200);
    const comps = countries.body.flatMap((c: { competitions: { id: string; upcoming: number }[] }) => c.competitions);
    expect(comps.map((c: { id: string }) => c.id)).not.toContain(b.competitionId);
    expect(comps.find((c: { id: string }) => c.id === a.competitionId).upcoming).toBe(1);
    await ctx.http().get(`/catalog/events/${b.event.id}`).expect(404);

    await ctx.prisma.market.update({ where: { id: a.market.id }, data: { enabled: false } });
    const detail = await ctx.http().get(`/catalog/events/${a.event.id}`).expect(200);
    expect(detail.body.markets).toEqual([]);
  });

  it('competition page, live list, match page and search', async () => {
    const a = await seedEvent(ctx);
    const l = await seedEvent(ctx, { status: 'LIVE', startInMin: -40 });
    const comp = await ctx.http().get(`/catalog/competitions/${a.competitionId}`).expect(200);
    expect(comp.body.events.map((e: { id: string }) => e.id)).toEqual([a.event.id]);
    const live = await ctx.http().get('/catalog/live').expect(200);
    expect(live.body.map((e: { id: string; minute: number }) => [e.id, e.minute])).toEqual([[l.event.id, 30]]);
    const match = await ctx.http().get(`/catalog/events/${a.event.id}`).expect(200);
    expect(match.body).toMatchObject({ homeTeam: a.event.homeTeam, marketCount: 1 });
    expect(match.body.markets[0].selections[0]).toMatchObject({ outcome: 'HOME', oddsMilli: 2000, active: true });
    const search = await ctx.http().get(`/catalog/search?q=${encodeURIComponent(a.event.homeTeam)}`).expect(200);
    expect(search.body.events.map((e: { id: string }) => e.id)).toContain(a.event.id);
  });
});
