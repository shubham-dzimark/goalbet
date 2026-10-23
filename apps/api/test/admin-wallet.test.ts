import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSetting } from './fixtures.js';
import { type TestContext, adminLogin, createAdmin, createTestApp, registerPlayer, resetDb } from './helpers.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

describe('F3.3 admin wallet credit / debit', () => {
  it('credits RON with a required reason; ledger + admin + wallet audit entries', async () => {
    const p = await registerPlayer(ctx, 1);
    const fin = await createAdmin(ctx, 'FINANCE');
    const token = await adminLogin(ctx, fin);
    const auth = { Authorization: `Bearer ${token}` };

    const noReason = await ctx.http().post(`/admin/users/${p.id}/wallet`).set(auth).send({ type: 'ADMIN_CREDIT', amountBani: 10_000, reason: ' ' });
    expect(noReason.body.error.code).toBe('VALIDATION_FAILED');
    expect(noReason.body.error.details.fields.reason).toBe('validation.reason');

    const ok = await ctx.http().post(`/admin/users/${p.id}/wallet`).set(auth).send({ type: 'ADMIN_CREDIT', amountBani: 10_000, reason: 'Welcome credit' }).expect(200);
    expect(ok.body).toMatchObject({ status: 'APPLIED', balanceBani: 10_000 });
    const tx = await ctx.prisma.walletTransaction.findFirstOrThrow();
    expect(tx).toMatchObject({ type: 'ADMIN_CREDIT', amountBani: 10_000, balanceAfterBani: 10_000, reason: 'Welcome credit', adminId: fin.id });
    const actions = (await ctx.prisma.auditLog.findMany({ where: { actorId: fin.id } })).map((a) => `${a.category}:${a.action}`);
    expect(actions).toEqual(expect.arrayContaining(['ADMIN:WALLET_CREDITED', 'WALLET:WALLET_ADMIN_CREDIT']));

    // the player sees it
    const me = await ctx.http().get('/wallet').set('Authorization', `Bearer ${p.token}`).expect(200);
    expect(me.body.balanceBani).toBe(10_000);

    // debit cannot take the balance below zero
    const over = await ctx.http().post(`/admin/users/${p.id}/wallet`).set(auth).send({ type: 'ADMIN_DEBIT', amountBani: 20_000, reason: 'Correction' });
    expect(over.body.error.code).toBe('NEGATIVE_BALANCE');
    const debit = await ctx.http().post(`/admin/users/${p.id}/wallet`).set(auth).send({ type: 'ADMIN_DEBIT', amountBani: 2_500, reason: 'Correction' }).expect(200);
    expect(debit.body.balanceBani).toBe(7_500);
  });

  it('operators cannot move money', async () => {
    const p = await registerPlayer(ctx, 2);
    const op = await createAdmin(ctx, 'OPERATOR');
    const token = await adminLogin(ctx, op);
    const res = await ctx
      .http()
      .post(`/admin/users/${p.id}/wallet`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'ADMIN_CREDIT', amountBani: 100, reason: 'nope' })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('amounts above the threshold need a second admin', async () => {
    await setSetting(ctx, 'wallet.approvalThresholdBani', 50_000);
    const p = await registerPlayer(ctx, 3);
    const a1 = await createAdmin(ctx, 'FINANCE');
    const a2 = await createAdmin(ctx, 'SUPER_ADMIN');
    const t1 = { Authorization: `Bearer ${await adminLogin(ctx, a1)}` };
    const t2 = { Authorization: `Bearer ${await adminLogin(ctx, a2)}` };

    const req = await ctx.http().post(`/admin/users/${p.id}/wallet`).set(t1).send({ type: 'ADMIN_CREDIT', amountBani: 60_000, reason: 'VIP bonus' }).expect(200);
    expect(req.body.status).toBe('PENDING_APPROVAL');
    expect((await ctx.prisma.wallet.findUniqueOrThrow({ where: { userId: p.id } })).balanceBani).toBe(0);

    const self = await ctx.http().post(`/admin/approvals/${req.body.approvalId}/approve`).set(t1).expect(403);
    expect(self.body.error.code).toBe('SELF_APPROVAL');
    const ok = await ctx.http().post(`/admin/approvals/${req.body.approvalId}/approve`).set(t2).expect(200);
    expect(ok.body).toMatchObject({ status: 'APPROVED', balanceBani: 60_000 });
    await ctx.http().post(`/admin/approvals/${req.body.approvalId}/approve`).set(t2).expect(409);

    const tx = await ctx.prisma.walletTransaction.findFirstOrThrow();
    expect(tx.approvalId).toBe(req.body.approvalId);
    const actions = (await ctx.prisma.auditLog.findMany({ where: { entityId: req.body.approvalId } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['CREDIT_APPROVAL_REQUESTED', 'CREDIT_APPROVAL_APPROVED']));
  });
});
