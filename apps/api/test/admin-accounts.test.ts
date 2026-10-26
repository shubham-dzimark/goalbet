import { generate, generateSecret } from 'otplib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestContext, adminLogin, createAdmin, createTestApp, resetDb } from './helpers.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

/** A login used a TOTP step; tests that need another code in the same 30 s window clear it. */
const allowNextCode = (id: string) => ctx.prisma.adminUser.update({ where: { id }, data: { totpLastStep: null } });

async function as(role: 'SUPER_ADMIN' | 'OPERATOR' | 'FINANCE') {
  const admin = await createAdmin(ctx, role);
  const auth = { Authorization: `Bearer ${await adminLogin(ctx, admin)}` };
  return { ...admin, auth };
}

describe('F3.1 own admin account', () => {
  it('shows profile, 2FA state and sessions; renames', async () => {
    const op = await as('OPERATOR');
    const acc = await ctx.http().get('/admin/account').set(op.auth).expect(200);
    expect(acc.body).toMatchObject({ email: op.email, role: 'OPERATOR', totpEnabled: true });
    expect(acc.body.sessions).toEqual([expect.objectContaining({ current: true })]);
    const renamed = await ctx.http().patch('/admin/account').set(op.auth).send({ name: 'Ops Lead' }).expect(200);
    expect(renamed.body.name).toBe('Ops Lead');
    expect(await ctx.prisma.auditLog.count({ where: { action: 'ADMIN_PROFILE_UPDATED', entityId: op.id } })).toBe(1);
  });

  it('changes the password with the current password and a 2FA code; other sessions end', async () => {
    const fin = await createAdmin(ctx, 'FINANCE');
    const first = { Authorization: `Bearer ${await adminLogin(ctx, fin)}` };
    await allowNextCode(fin.id);
    const second = { Authorization: `Bearer ${await adminLogin(ctx, fin)}` };
    await allowNextCode(fin.id);

    const wrong = await ctx.http().post('/admin/account/password').set(first).send({ currentPassword: 'nope', newPassword: 'NewPass123', totp: await generate({ secret: fin.secret }) });
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    const badCode = await ctx.http().post('/admin/account/password').set(first).send({ currentPassword: fin.password, newPassword: 'NewPass123', totp: '000000' });
    expect(badCode.body.error.code).toBe('TOTP_INVALID');
    const weak = await ctx.http().post('/admin/account/password').set(first).send({ currentPassword: fin.password, newPassword: 'short', totp: '123456' });
    expect(weak.body.error.code).toBe('VALIDATION_FAILED');

    await ctx.http().post('/admin/account/password').set(first).send({ currentPassword: fin.password, newPassword: 'NewPass123', totp: await generate({ secret: fin.secret }) }).expect(200);
    await ctx.http().get('/admin/account').set(first).expect(200);
    await ctx.http().get('/admin/account').set(second).expect(401); // the other session ended
    const old = await ctx.http().post('/admin/auth/login').send({ email: fin.email, password: fin.password });
    expect(old.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(await ctx.prisma.auditLog.count({ where: { action: 'ADMIN_PASSWORD_CHANGED', entityId: fin.id } })).toBe(1);
  });

  it('moves 2FA to a new authenticator: current code → new QR → code from the new app', async () => {
    const op = await as('OPERATOR');
    await allowNextCode(op.id);
    const bad = await ctx.http().post('/admin/account/totp/start').set(op.auth).send({ totp: '000000' });
    expect(bad.body.error.code).toBe('TOTP_INVALID');
    const start = await ctx.http().post('/admin/account/totp/start').set(op.auth).send({ totp: await generate({ secret: op.secret }) }).expect(200);
    expect(start.body.qrDataUrl).toMatch(/^data:image\/png/);

    const wrongApp = await ctx.http().post('/admin/account/totp/confirm').set(op.auth).send({ setupToken: start.body.setupToken, totp: await generate({ secret: generateSecret() }) });
    expect(wrongApp.body.error.code).toBe('TOTP_INVALID');
    await ctx.http().post('/admin/account/totp/confirm').set(op.auth).send({ setupToken: start.body.setupToken, totp: await generate({ secret: start.body.secret }) }).expect(200);

    const row = await ctx.prisma.adminUser.findUniqueOrThrow({ where: { id: op.id } });
    await ctx.prisma.adminUser.update({ where: { id: op.id }, data: { totpLastStep: null } });
    const oldCode = await ctx.http().post('/admin/auth/login').send({ email: op.email, password: op.password, totp: await generate({ secret: op.secret }) });
    expect(oldCode.body.error.code).toBe('TOTP_INVALID');
    await ctx.http().post('/admin/auth/login').send({ email: op.email, password: op.password, totp: await generate({ secret: start.body.secret }) }).expect(200);
    expect(row.totpEnabled).toBe(true);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'ADMIN_TOTP_CHANGED', entityId: op.id } })).toBe(1);
  });

  it('ends one other session or all of them, never the current one by id', async () => {
    const op = await createAdmin(ctx, 'OPERATOR');
    const a = { Authorization: `Bearer ${await adminLogin(ctx, op)}` };
    await allowNextCode(op.id);
    const b = { Authorization: `Bearer ${await adminLogin(ctx, op)}` };
    const acc = await ctx.http().get('/admin/account').set(a).expect(200);
    expect(acc.body.sessions).toHaveLength(2);
    const current = acc.body.sessions.find((s: { current: boolean }) => s.current).id;
    const self = await ctx.http().delete(`/admin/account/sessions/${current}`).set(a);
    expect(self.body.error.code).toBe('SELF_ACTION');
    const after = await ctx.http().delete('/admin/account/sessions/others').set(a).expect(200);
    expect(after.body.sessions).toHaveLength(1);
    await ctx.http().get('/admin/account').set(b).expect(401);
  });
});

describe('F3.1 managing admins (Super admin)', () => {
  it('only Super admins can manage admins', async () => {
    const op = await as('OPERATOR');
    await ctx.http().get('/admin/admins').set(op.auth).expect(403);
  });

  it('creates an admin with a one-time password; first login asks for the QR enrolment', async () => {
    const sa = await as('SUPER_ADMIN');
    const res = await ctx.http().post('/admin/admins').set(sa.auth).send({ name: 'New Finance', email: 'New.Fin@GoalBet.test', role: 'FINANCE' }).expect(201);
    expect(res.body.admin).toMatchObject({ email: 'new.fin@goalbet.test', role: 'FINANCE', totpEnabled: false, status: 'ACTIVE' });
    expect(res.body.temporaryPassword.length).toBeGreaterThanOrEqual(10);
    const login = await ctx.http().post('/admin/auth/login').send({ email: 'new.fin@goalbet.test', password: res.body.temporaryPassword }).expect(200);
    expect(login.body.status).toBe('TOTP_SETUP');
    const dup = await ctx.http().post('/admin/admins').set(sa.auth).send({ name: 'Again', email: 'new.fin@goalbet.test', role: 'OPERATOR' });
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
    const list = await ctx.http().get('/admin/admins').set(sa.auth).expect(200);
    expect(list.body).toHaveLength(2);
  });

  it('changes another admin’s role (their sessions end) but not its own', async () => {
    const sa = await as('SUPER_ADMIN');
    const op = await as('OPERATOR');
    const res = await ctx.http().patch(`/admin/admins/${op.id}`).set(sa.auth).send({ role: 'FINANCE', reason: 'Moved to finance' }).expect(200);
    expect(res.body.role).toBe('FINANCE');
    await ctx.http().get('/admin/account').set(op.auth).expect(401);
    const self = await ctx.http().patch(`/admin/admins/${sa.id}`).set(sa.auth).send({ role: 'OPERATOR', reason: 'Oops' });
    expect(self.body.error.code).toBe('SELF_ACTION');
    const ownName = await ctx.http().patch(`/admin/admins/${sa.id}`).set(sa.auth).send({ name: 'Head of Ops', reason: 'Title change' }).expect(200);
    expect(ownName.body.name).toBe('Head of Ops');
  });

  it('suspends (sessions end), activates, resets password and 2FA; never on itself', async () => {
    const sa = await as('SUPER_ADMIN');
    const op = await as('OPERATOR');
    expect((await ctx.http().post(`/admin/admins/${sa.id}/status`).set(sa.auth).send({ status: 'SUSPENDED', reason: 'Test' })).body.error.code).toBe('SELF_ACTION');

    await ctx.http().post(`/admin/admins/${op.id}/status`).set(sa.auth).send({ status: 'SUSPENDED', reason: 'Left the company' }).expect(200);
    await ctx.http().get('/admin/account').set(op.auth).expect(401);
    await ctx.http().post(`/admin/admins/${op.id}/status`).set(sa.auth).send({ status: 'ACTIVE', reason: 'Back' }).expect(200);

    const reset = await ctx.http().post(`/admin/admins/${op.id}/reset-password`).set(sa.auth).send({ reason: 'Forgot password' }).expect(200);
    await ctx.http().post('/admin/auth/login').send({ email: op.email, password: reset.body.temporaryPassword }).expect(200);

    await ctx.http().post(`/admin/admins/${op.id}/reset-2fa`).set(sa.auth).send({ reason: 'Lost phone' }).expect(200);
    const login = await ctx.http().post('/admin/auth/login').send({ email: op.email, password: reset.body.temporaryPassword }).expect(200);
    expect(login.body.status).toBe('TOTP_SETUP');

    const actions = (await ctx.prisma.auditLog.findMany({ where: { entityId: op.id, actorId: sa.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['ADMIN_SUSPENDED', 'ADMIN_ACTIVATED', 'ADMIN_PASSWORD_RESET', 'ADMIN_2FA_RESET']));
  });
});
