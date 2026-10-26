import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fund, idemKey, seedEvent } from './fixtures.js';
import { type TestContext, adminLogin, createAdmin, createTestApp, registerPlayer, resetDb } from './helpers.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

/** Logged-in admin of a role; each test logs an admin in once (TOTP codes can't be replayed). */
async function as(role: 'SUPER_ADMIN' | 'OPERATOR' | 'FINANCE') {
  const admin = await createAdmin(ctx, role);
  const auth = { Authorization: `Bearer ${await adminLogin(ctx, admin)}` };
  return { ...admin, auth };
}

function placeSingle(token: string, selectionId: string, oddsMilli: number, stakeBani = 1000) {
  return ctx
    .http()
    .post('/bets')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', idemKey())
    .send({ type: 'SINGLE', stakeBani, oddsChangePreference: 'NONE', legs: [{ kind: 'SELECTION', selectionId, oddsMilli }] });
}

describe('F3.2 user management', () => {
  it('lists and searches players with balance and open tickets; detail has stats and limits', async () => {
    const p1 = await registerPlayer(ctx, 101);
    await registerPlayer(ctx, 102);
    const { home } = await seedEvent(ctx);
    await fund(ctx, p1.id, 5_000);
    await placeSingle(p1.token, home.id, 2000, 1_500).expect(201);
    const op = await as('OPERATOR');

    const all = await ctx.http().get('/admin/users').set(op.auth).expect(200);
    expect(all.body.items).toHaveLength(2);
    const found = await ctx.http().get('/admin/users').query({ q: p1.email }).set(op.auth).expect(200);
    expect(found.body.items).toHaveLength(1);
    expect(found.body.items[0]).toMatchObject({ id: p1.id, balanceBani: 3_500, openTickets: 1, status: 'ACTIVE' });

    const detail = await ctx.http().get(`/admin/users/${p1.id}`).set(op.auth).expect(200);
    expect(detail.body.stats).toMatchObject({ tickets: 1, openStakeBani: 1_500, totalStakedBani: 1_500 });
    expect(detail.body.limits).toEqual([]);
  });

  it('edits a player (audited, unique phone enforced)', async () => {
    const p1 = await registerPlayer(ctx, 103);
    const p2 = await registerPlayer(ctx, 104);
    const op = await as('OPERATOR');
    const res = await ctx.http().patch(`/admin/users/${p1.id}`).set(op.auth).send({ name: 'Renamed Player' }).expect(200);
    expect(res.body.name).toBe('Renamed Player');
    const taken = await ctx.http().patch(`/admin/users/${p1.id}`).set(op.auth).send({ phone: p2.phone });
    expect(taken.body.error.code).toBe('PHONE_TAKEN');
    expect(await ctx.prisma.auditLog.count({ where: { action: 'USER_UPDATED', entityId: p1.id, actorId: op.id } })).toBe(1);
  });

  it('suspends a player (sessions end, login refused) and activates again; finance cannot', async () => {
    const p = await registerPlayer(ctx, 105);
    const fin = await as('FINANCE');
    await ctx.http().post(`/admin/users/${p.id}/status`).set(fin.auth).send({ status: 'SUSPENDED', reason: 'Fraud check' }).expect(403);

    const op = await as('OPERATOR');
    const noReason = await ctx.http().post(`/admin/users/${p.id}/status`).set(op.auth).send({ status: 'SUSPENDED', reason: '' });
    expect(noReason.body.error.code).toBe('VALIDATION_FAILED');
    const res = await ctx.http().post(`/admin/users/${p.id}/status`).set(op.auth).send({ status: 'SUSPENDED', reason: 'Fraud check' }).expect(200);
    expect(res.body.status).toBe('SUSPENDED');
    expect(await ctx.prisma.authSession.count({ where: { subjectId: p.id, revokedAt: null } })).toBe(0);
    const login = await ctx.http().post('/auth/login').send({ email: p.email, password: p.password });
    expect(login.body.error.code).toBe('ACCOUNT_SUSPENDED');

    await ctx.http().post(`/admin/users/${p.id}/status`).set(op.auth).send({ status: 'ACTIVE', reason: 'Cleared' }).expect(200);
    await ctx.http().post('/auth/login').send({ email: p.email, password: p.password }).expect(200);
    const actions = (await ctx.prisma.auditLog.findMany({ where: { entityId: p.id, category: 'ADMIN' } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['USER_SUSPENDED', 'USER_ACTIVATED']));
  });

  it('operator limits apply at once and are enforced on bets', async () => {
    const p = await registerPlayer(ctx, 106);
    const { home } = await seedEvent(ctx);
    await fund(ctx, p.id, 10_000);
    const op = await as('OPERATOR');
    const res = await ctx
      .http()
      .put(`/admin/users/${p.id}/limits`)
      .set(op.auth)
      .send({ type: 'MAX_STAKE_PER_BET', amountBani: 500, reason: 'Responsible gaming' })
      .expect(200);
    expect(res.body.limits).toEqual([expect.objectContaining({ type: 'MAX_STAKE_PER_BET', source: 'ADMIN', amountBani: 500 })]);
    const over = await placeSingle(p.token, home.id, 2000, 1_000);
    expect(over.body.error.code).toBe('USER_LIMIT_EXCEEDED');

    await ctx.http().put(`/admin/users/${p.id}/limits`).set(op.auth).send({ type: 'MAX_STAKE_PER_BET', amountBani: null, reason: 'Lifted' }).expect(200);
    await placeSingle(p.token, home.id, 2000, 1_000).expect(201);
  });
});

describe('F3.3 wallet transaction log', () => {
  it('lists every wallet movement with player, admin and filters; approvals show who asked', async () => {
    const p = await registerPlayer(ctx, 201);
    const fin = await as('FINANCE');
    await ctx.http().post(`/admin/users/${p.id}/wallet`).set(fin.auth).send({ type: 'ADMIN_CREDIT', amountBani: 2_000, reason: 'Welcome' }).expect(200);
    const { home } = await seedEvent(ctx);
    await placeSingle(p.token, home.id, 2000, 500).expect(201);

    const all = await ctx.http().get('/admin/wallet/transactions').set(fin.auth).expect(200);
    expect(all.body.items.map((t: { type: string }) => t.type)).toEqual(['STAKE', 'ADMIN_CREDIT']);
    expect(all.body.items[1]).toMatchObject({ user: { id: p.id }, admin: { id: fin.id }, reason: 'Welcome' });
    const credits = await ctx.http().get('/admin/wallet/transactions').query({ type: 'ADMIN_CREDIT' }).set(fin.auth).expect(200);
    expect(credits.body.items).toHaveLength(1);
  });
});

describe('F3.4 bet management', () => {
  it('finds tickets by view, code or email and shows the detail with its wallet movements', async () => {
    const p = await registerPlayer(ctx, 301);
    const { home } = await seedEvent(ctx);
    await fund(ctx, p.id, 5_000);
    const placed = await placeSingle(p.token, home.id, 2000, 1_000).expect(201);
    const op = await as('OPERATOR');

    const open = await ctx.http().get('/admin/tickets').query({ view: 'open' }).set(op.auth).expect(200);
    expect(open.body.items).toHaveLength(1);
    expect(open.body.items[0]).toMatchObject({ code: placed.body.code, user: { id: p.id } });
    const settled = await ctx.http().get('/admin/tickets').query({ view: 'settled' }).set(op.auth).expect(200);
    expect(settled.body.items).toHaveLength(0);
    const byCode = await ctx.http().get('/admin/tickets').query({ q: placed.body.code.toLowerCase() }).set(op.auth).expect(200);
    expect(byCode.body.items).toHaveLength(1);
    const byEmail = await ctx.http().get('/admin/tickets').query({ q: p.email }).set(op.auth).expect(200);
    expect(byEmail.body.items).toHaveLength(1);

    const detail = await ctx.http().get(`/admin/tickets/${placed.body.id}`).set(op.auth).expect(200);
    expect(detail.body.transactions).toEqual([expect.objectContaining({ type: 'STAKE', amountBani: -1_000 })]);
  });
});

describe('F3.5 sportsbook settings', () => {
  it('a disabled league disappears from the catalogue', async () => {
    const { competitionId } = await seedEvent(ctx);
    const op = await as('OPERATOR');
    const list = await ctx.http().get('/admin/sportsbook/competitions').set(op.auth).expect(200);
    expect(list.body.find((c: { id: string }) => c.id === competitionId)).toMatchObject({ enabled: true, upcoming: 1 });
    await ctx.http().patch(`/admin/sportsbook/competitions/${competitionId}`).set(op.auth).send({ enabled: false }).expect(200);
    const countries = await ctx.http().get('/catalog/countries').expect(200);
    const ids = countries.body.flatMap((c: { competitions: { id: string }[] }) => c.competitions.map((x) => x.id));
    expect(ids).not.toContain(competitionId);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'COMPETITION_UPDATED', entityId: competitionId } })).toBe(1);
  });

  it('disabled market types, suspended events and suspended markets refuse bets', async () => {
    const p = await registerPlayer(ctx, 401);
    await fund(ctx, p.id, 10_000);
    const op = await as('OPERATOR');

    const a = await seedEvent(ctx);
    await ctx.http().put('/admin/sportsbook/market-types').set(op.auth).send({ type: 'MATCH_RESULT', enabled: false }).expect(200);
    expect((await placeSingle(p.token, a.home.id, 2000)).body.error.code).toBe('MARKET_CLOSED');
    await ctx.http().put('/admin/sportsbook/market-types').set(op.auth).send({ type: 'MATCH_RESULT', enabled: true }).expect(200);

    const susp = await ctx.http().post(`/admin/sportsbook/events/${a.event.id}/suspend`).set(op.auth).send({ suspended: true, reason: 'Integrity alert' }).expect(200);
    expect(susp.body.suspended).toBe(true);
    expect((await placeSingle(p.token, a.home.id, 2000)).body.error.code).toBe('EVENT_SUSPENDED');
    await ctx.http().post(`/admin/sportsbook/events/${a.event.id}/suspend`).set(op.auth).send({ suspended: false, reason: 'Resolved' }).expect(200);
    await placeSingle(p.token, a.home.id, 2000).expect(201);

    const mkt = await ctx.http().patch(`/admin/sportsbook/markets/${a.market.id}`).set(op.auth).send({ suspended: true, reason: 'Price check' }).expect(200);
    expect(mkt.body).toMatchObject({ status: 'SUSPENDED', adminSuspended: true });
    expect((await placeSingle(p.token, a.home.id, 2000)).body.error.code).toBe('MARKET_SUSPENDED');

    const events = await ctx.http().get('/admin/sportsbook/events').set(op.auth).expect(200);
    expect(events.body.items[0]).toMatchObject({ id: a.event.id, openTickets: 1, markets: 1 });
  });

  it('limits: operators own betting settings, finance owns the wallet threshold; values are validated', async () => {
    const op = await as('OPERATOR');
    const fin = await as('FINANCE');
    const ok = await ctx.http().put('/admin/sportsbook/settings').set(op.auth).send({ key: 'betting.maxStakeBani', value: 200_000 }).expect(200);
    expect(ok.body.values['betting.maxStakeBani']).toBe(200_000);
    const bad = await ctx.http().put('/admin/sportsbook/settings').set(op.auth).send({ key: 'betting.minStakeBani', value: 300_000 });
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    const wrongType = await ctx.http().put('/admin/sportsbook/settings').set(op.auth).send({ key: 'cashout.enabled', value: 5 });
    expect(wrongType.body.error.code).toBe('VALIDATION_FAILED');
    await ctx.http().put('/admin/sportsbook/settings').set(op.auth).send({ key: 'wallet.approvalThresholdBani', value: 1_000 }).expect(403);
    await ctx.http().put('/admin/sportsbook/settings').set(fin.auth).send({ key: 'wallet.approvalThresholdBani', value: 1_000 }).expect(200);
    await ctx.http().put('/admin/sportsbook/settings').set(fin.auth).send({ key: 'betting.maxStakeBani', value: 100_000 }).expect(403);
  });
});

describe('F3.6 reports and dashboard', () => {
  it('totals come from the ledger; exposure covers open tickets', async () => {
    const p = await registerPlayer(ctx, 501);
    const fin = await as('FINANCE');
    await ctx.http().post(`/admin/users/${p.id}/wallet`).set(fin.auth).send({ type: 'ADMIN_CREDIT', amountBani: 10_000, reason: 'Promo' }).expect(200);
    const { home, event } = await seedEvent(ctx);
    const placed = await placeSingle(p.token, home.id, 2000, 2_000);
    expect(placed.body.error).toBeUndefined();

    const report = await ctx.http().get('/admin/reports').set(fin.auth).expect(200);
    expect(report.body.users).toMatchObject({ total: 1, new: 1, active: 1, suspended: 0 });
    expect(report.body.betting).toMatchObject({ tickets: 1, stakesBani: 2_000, payoutsBani: 0, ggrBani: 2_000 });
    expect(report.body.wallet).toMatchObject({ creditsBani: 10_000, debitsBani: 0 });
    expect(report.body.exposure).toMatchObject({ openTickets: 1, openStakeBani: 2_000, potentialPayoutBani: 4_000 });
    expect(report.body.daily).toHaveLength(30); // last 30 days incl. today
    expect(report.body.daily.at(-1)).toMatchObject({ stakesBani: 2_000, tickets: 1 });
    expect(report.body.topExposure[0]).toMatchObject({ eventId: event.id, tickets: 1, potentialPayoutBani: 4_000 });

    const dash = await ctx.http().get('/admin/dashboard').set(fin.auth).expect(200);
    expect(dash.body).toMatchObject({ openTickets: 1, exposureBani: 4_000, today: { tickets: 1, stakesBani: 2_000, newUsers: 1 } });
    expect(dash.body.last7Days).toHaveLength(7);
    expect(dash.body.recentAudit.length).toBeGreaterThan(0);
  });
});

describe('F3.8 audit logs', () => {
  it('filters by category, action and actor; lists the known actions', async () => {
    const p = await registerPlayer(ctx, 601);
    const op = await as('OPERATOR');
    await ctx.http().post(`/admin/users/${p.id}/status`).set(op.auth).send({ status: 'SUSPENDED', reason: 'Checking documents' }).expect(200);

    const admin = await ctx.http().get('/admin/audit').query({ category: 'ADMIN', action: 'USER_SUSPENDED' }).set(op.auth).expect(200);
    expect(admin.body.items).toHaveLength(1);
    expect(admin.body.items[0]).toMatchObject({ actorId: op.id, entityId: p.id, meta: { reason: 'Checking documents' } });
    const byActor = await ctx.http().get('/admin/audit').query({ q: op.email }).set(op.auth).expect(200);
    expect(byActor.body.items.length).toBeGreaterThanOrEqual(1);
    const actions = await ctx.http().get('/admin/audit/actions').set(op.auth).expect(200);
    expect(actions.body).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'ADMIN', action: 'USER_SUSPENDED' })]));
  });

  it('requires an admin session', async () => {
    await ctx.http().get('/admin/audit').expect(401);
    const p = await registerPlayer(ctx, 602);
    await ctx.http().get('/admin/users').set('Authorization', `Bearer ${p.token}`).expect(401);
  });
});
