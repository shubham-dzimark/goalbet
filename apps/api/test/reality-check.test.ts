import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestContext, createTestApp, registerPlayer, resetDb } from './helpers.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

describe('responsible gambling: reality check preference', () => {
  it('stores 15/30/60/120 minutes or off, refuses other values, and audits the change', async () => {
    const p = await registerPlayer(ctx, 961);
    const auth = { Authorization: `Bearer ${p.token}` };
    expect((await ctx.http().get('/me').set(auth).expect(200)).body.realityCheckMinutes).toBeNull();

    const on = await ctx.http().patch('/me').set(auth).send({ realityCheckMinutes: 30 }).expect(200);
    expect(on.body.realityCheckMinutes).toBe(30);
    await ctx.http().patch('/me').set(auth).send({ realityCheckMinutes: 45 }).expect(400);

    const off = await ctx.http().patch('/me').set(auth).send({ realityCheckMinutes: null }).expect(200);
    expect(off.body.realityCheckMinutes).toBeNull();
    expect(await ctx.prisma.auditLog.count({ where: { action: 'USER_PROFILE_UPDATED', entityId: p.id } })).toBe(2);
  });
});
