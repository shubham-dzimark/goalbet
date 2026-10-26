import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fund, idemKey, seedEvent, setSetting } from './fixtures.js';
import { type TestContext, adminLogin, createAdmin, createTestApp, registerPlayer, resetDb } from './helpers.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

const IBAN = 'RO49 AAAA 1B31 0075 9384 0000';

async function as(role: 'SUPER_ADMIN' | 'OPERATOR' | 'FINANCE') {
  const admin = await createAdmin(ctx, role);
  return { ...admin, auth: { Authorization: `Bearer ${await adminLogin(ctx, admin)}` } };
}
async function player(n: number, bani = 0) {
  const p = await registerPlayer(ctx, n);
  if (bani) await fund(ctx, p.id, bani);
  return { ...p, auth: { Authorization: `Bearer ${p.token}` } };
}
const wallet = (id: string) => ctx.prisma.wallet.findUniqueOrThrow({ where: { userId: id } });
const request = (p: { auth: Record<string, string> }, body: object) => ctx.http().post('/wallet/requests').set(p.auth).send(body);

describe('deposit requests', () => {
  it('moves no money until Finance approves; then credits a DEPOSIT and tells the player', async () => {
    const p = await player(801);
    const res = await request(p, { type: 'DEPOSIT', method: 'BANK_TRANSFER', amountBani: 15_000, payerReference: 'TRX-991' }).expect(201);
    expect(res.body).toMatchObject({ type: 'DEPOSIT', status: 'PENDING', amountBani: 15_000 });
    expect(res.body.reference).toMatch(/^D-[A-HJ-NP-Z2-9]{6}$/);
    expect((await wallet(p.id)).balanceBani).toBe(0);

    const op = await as('OPERATOR');
    await ctx.http().post(`/admin/payment-requests/${res.body.id}/approve`).set(op.auth).send({}).expect(403);

    const fin = await as('FINANCE');
    const queue = await ctx.http().get('/admin/payment-requests').query({ status: 'PENDING' }).set(fin.auth).expect(200);
    expect(queue.body.items[0]).toMatchObject({ reference: res.body.reference, user: { id: p.id }, details: { payerReference: 'TRX-991' } });

    const ok = await ctx.http().post(`/admin/payment-requests/${res.body.id}/approve`).set(fin.auth).send({ note: 'Seen on statement' }).expect(200);
    expect(ok.body).toMatchObject({ status: 'APPROVED', decidedBy: { id: fin.id } });
    expect((await wallet(p.id)).balanceBani).toBe(15_000);
    const tx = await ctx.prisma.walletTransaction.findFirstOrThrow({ where: { type: 'DEPOSIT' } });
    expect(tx).toMatchObject({ amountBani: 15_000, adminId: fin.id, uniqueRef: `PAY:${res.body.id}` });

    const again = await ctx.http().post(`/admin/payment-requests/${res.body.id}/approve`).set(fin.auth).send({});
    expect(again.body.error.code).toBe('REQUEST_NOT_PENDING');
    const actions = (await ctx.prisma.auditLog.findMany({ where: { entityId: res.body.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['DEPOSIT_REQUESTED', 'DEPOSIT_APPROVED']));
  });

  it('enforces limits, enabled methods, the pending cap and self-exclusion', async () => {
    const p = await player(802);
    expect((await request(p, { type: 'DEPOSIT', method: 'BANK_TRANSFER', amountBani: 500 })).body.error.code).toBe('PAYMENT_AMOUNT_LIMIT');
    await setSetting(ctx, 'payments.cashAtShopEnabled', false);
    expect((await request(p, { type: 'DEPOSIT', method: 'CASH_AT_SHOP', amountBani: 5_000 })).body.error.code).toBe('PAYMENT_METHOD_DISABLED');
    for (let i = 0; i < 3; i++) await request(p, { type: 'DEPOSIT', method: 'BANK_TRANSFER', amountBani: 5_000 }).expect(201);
    expect((await request(p, { type: 'DEPOSIT', method: 'BANK_TRANSFER', amountBani: 5_000 })).body.error.code).toBe('TOO_MANY_PENDING');

    const ex = await player(803, 10_000);
    await ctx.http().post('/me/self-exclusion').set(ex.auth).send({ days: 7 }).expect(201);
    expect((await request(ex, { type: 'DEPOSIT', method: 'BANK_TRANSFER', amountBani: 5_000 })).body.error.code).toBe('SELF_EXCLUDED');
    // they may still take their money out
    await request(ex, { type: 'WITHDRAWAL', method: 'BANK_TRANSFER', amountBani: 5_000, iban: IBAN, accountHolder: 'Ex Player' }).expect(201);
  });
});

describe('withdrawal requests', () => {
  it('holds the amount at once: it cannot be staked, requested twice or debited by an admin', async () => {
    const p = await player(811, 10_000);
    const bad = await request(p, { type: 'WITHDRAWAL', method: 'BANK_TRANSFER', amountBani: 6_000, iban: 'RO49AAAA1B31007593840001', accountHolder: 'A' });
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    const res = await request(p, { type: 'WITHDRAWAL', method: 'BANK_TRANSFER', amountBani: 6_000, iban: IBAN, accountHolder: 'Ana Popescu' }).expect(201);
    expect(res.body.details).toMatchObject({ iban: 'RO49 •••• •••• 0000', accountHolder: 'Ana Popescu' });
    expect(await wallet(p.id)).toMatchObject({ balanceBani: 10_000, heldBani: 6_000 });

    const info = await ctx.http().get('/wallet/payment-info').set(p.auth).expect(200);
    expect(info.body).toMatchObject({ availableBani: 4_000, heldBani: 6_000, pendingWithdrawal: true, methods: ['BANK_TRANSFER', 'CASH_AT_SHOP'] });

    const { home } = await seedEvent(ctx);
    const stake = await ctx.http().post('/bets').set(p.auth).set('Idempotency-Key', idemKey()).send({ type: 'SINGLE', stakeBani: 5_000, oddsChangePreference: 'ANY', legs: [{ kind: 'SELECTION', selectionId: home.id, oddsMilli: 2000 }] });
    expect(stake.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect((await request(p, { type: 'WITHDRAWAL', method: 'CASH_AT_SHOP', amountBani: 2_000 })).body.error.code).toBe('WITHDRAWAL_PENDING');

    const fin = await as('FINANCE');
    const debit = await ctx.http().post(`/admin/users/${p.id}/wallet`).set(fin.auth).send({ type: 'ADMIN_DEBIT', amountBani: 5_000, reason: 'Correction' });
    expect(debit.body.error.code).toBe('NEGATIVE_BALANCE');
  });

  it('approval debits the held amount; reject and cancel give it back', async () => {
    const p = await player(812, 20_000);
    const fin = await as('FINANCE');

    const w1 = await request(p, { type: 'WITHDRAWAL', method: 'BANK_TRANSFER', amountBani: 5_000, iban: IBAN, accountHolder: 'Ana Popescu' }).expect(201);
    await ctx.http().post(`/wallet/requests/${w1.body.id}/cancel`).set(p.auth).expect(200);
    expect(await wallet(p.id)).toMatchObject({ balanceBani: 20_000, heldBani: 0 });

    const w2 = await request(p, { type: 'WITHDRAWAL', method: 'CASH_AT_SHOP', amountBani: 4_000 }).expect(201);
    const noNote = await ctx.http().post(`/admin/payment-requests/${w2.body.id}/reject`).set(fin.auth).send({ note: '' });
    expect(noNote.body.error.code).toBe('VALIDATION_FAILED');
    await ctx.http().post(`/admin/payment-requests/${w2.body.id}/reject`).set(fin.auth).send({ note: 'ID not shown at the shop' }).expect(200);
    expect(await wallet(p.id)).toMatchObject({ balanceBani: 20_000, heldBani: 0 });

    const w3 = await request(p, { type: 'WITHDRAWAL', method: 'BANK_TRANSFER', amountBani: 7_500, iban: IBAN, accountHolder: 'Ana Popescu' }).expect(201);
    const queue = await ctx.http().get('/admin/payment-requests').query({ status: 'PENDING' }).set(fin.auth).expect(200);
    expect(queue.body.items[0].details.iban).toBe('RO49AAAA1B31007593840000'); // Finance sees the full IBAN
    await ctx.http().post(`/admin/payment-requests/${w3.body.id}/approve`).set(fin.auth).send({ note: 'Paid by transfer' }).expect(200);
    expect(await wallet(p.id)).toMatchObject({ balanceBani: 12_500, heldBani: 0 });
    expect(await ctx.prisma.walletTransaction.findFirstOrThrow({ where: { type: 'WITHDRAWAL' } })).toMatchObject({ amountBani: -7_500, balanceAfterBani: 12_500 });

    const cancelDone = await ctx.http().post(`/wallet/requests/${w3.body.id}/cancel`).set(p.auth);
    expect(cancelDone.body.error.code).toBe('REQUEST_NOT_PENDING');
    const mine = await ctx.http().get('/wallet/requests').set(p.auth).expect(200);
    expect(mine.body.items.map((r: { status: string }) => r.status)).toEqual(['APPROVED', 'REJECTED', 'CANCELLED']);
  });

  it('amounts above the threshold need two different Finance admins', async () => {
    await setSetting(ctx, 'wallet.approvalThresholdBani', 10_000);
    const p = await player(813, 50_000);
    const a = await as('FINANCE');
    const b = await as('SUPER_ADMIN');
    const res = await request(p, { type: 'WITHDRAWAL', method: 'BANK_TRANSFER', amountBani: 30_000, iban: IBAN, accountHolder: 'Big Winner' }).expect(201);

    const first = await ctx.http().post(`/admin/payment-requests/${res.body.id}/approve`).set(a.auth).send({}).expect(200);
    expect(first.body).toMatchObject({ status: 'PENDING', awaitingSecondApproval: true, firstApprovedBy: { id: a.id } });
    expect((await wallet(p.id)).balanceBani).toBe(50_000);
    expect((await ctx.http().post(`/admin/payment-requests/${res.body.id}/approve`).set(a.auth).send({})).body.error.code).toBe('SELF_APPROVAL');

    await ctx.http().post(`/admin/payment-requests/${res.body.id}/approve`).set(b.auth).send({}).expect(200);
    expect(await wallet(p.id)).toMatchObject({ balanceBani: 20_000, heldBani: 0 });
  });
});

describe('reports', () => {
  it('count deposits and withdrawals separately from admin credits; dashboard shows the queue', async () => {
    const p = await player(821);
    const fin = await as('FINANCE');
    const d = await request(p, { type: 'DEPOSIT', method: 'BANK_TRANSFER', amountBani: 20_000 }).expect(201);
    await ctx.http().post(`/admin/payment-requests/${d.body.id}/approve`).set(fin.auth).send({}).expect(200);
    const w = await request(p, { type: 'WITHDRAWAL', method: 'CASH_AT_SHOP', amountBani: 5_000 }).expect(201);
    const dash = await ctx.http().get('/admin/dashboard').set(fin.auth).expect(200);
    expect(dash.body.pendingPayments).toBe(1);
    await ctx.http().post(`/admin/payment-requests/${w.body.id}/approve`).set(fin.auth).send({}).expect(200);
    const report = await ctx.http().get('/admin/reports').set(fin.auth).expect(200);
    expect(report.body.wallet).toMatchObject({ depositsBani: 20_000, withdrawalsBani: 5_000, creditsBani: 0 });
  });
});
