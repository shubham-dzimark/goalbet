import { generate } from 'otplib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestContext, adminLogin, createAdmin, createTestApp, registerPlayer, resetDb } from './helpers.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

describe('F3.1 Admin login (email + password, + TOTP when the admin turned it on)', () => {
  it('requires the TOTP code after a correct password and rejects bad / replayed codes', async () => {
    const a = await createAdmin(ctx, 'OPERATOR');
    const step1 = await ctx.http().post('/admin/auth/login').send({ email: a.email, password: a.password }).expect(200);
    expect(step1.body).toEqual({ status: 'TOTP_REQUIRED' });
    expect(step1.headers['set-cookie']).toBeUndefined();

    const bad = await ctx.http().post('/admin/auth/login').send({ email: a.email, password: a.password, totp: '000000' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('TOTP_INVALID');

    const totp = await generate({ secret: a.secret });
    const ok = await ctx.http().post('/admin/auth/login').send({ email: a.email, password: a.password, totp }).expect(200);
    expect(ok.body.status).toBe('OK');
    expect(ok.body.admin.role).toBe('OPERATOR');
    expect(ok.headers['set-cookie']?.[0]).toMatch(/^gb_admin_rt=.*HttpOnly/);

    const replay = await ctx.http().post('/admin/auth/login').send({ email: a.email, password: a.password, totp });
    expect(replay.body.error.code).toBe('TOTP_INVALID');

    const actions = (await ctx.prisma.auditLog.findMany({ where: { entityId: a.id }, orderBy: { createdAt: 'asc' } })).map(
      (l) => l.action,
    );
    expect(actions).toEqual(['ADMIN_LOGIN_FAILED', 'ADMIN_LOGIN', 'ADMIN_LOGIN_FAILED']);
  });

  it('signs in with the password alone when the admin has not turned 2FA on', async () => {
    const a = await createAdmin(ctx, 'FINANCE', { totp: false });
    const res = await ctx.http().post('/admin/auth/login').send({ email: a.email, password: a.password }).expect(200);
    expect(res.body.status).toBe('OK');
    expect(res.headers['set-cookie']?.[0]).toMatch(/^gb_admin_rt=.*HttpOnly/);
  });

  it('lets an admin turn 2FA on (password → QR → code) and off again (password + code)', async () => {
    const a = await createAdmin(ctx, 'FINANCE', { totp: false });
    const token = await (await ctx.http().post('/admin/auth/login').send({ email: a.email, password: a.password })).body.accessToken;
    const auth = { Authorization: `Bearer ${token}` };

    const badPw = await ctx.http().post('/admin/account/totp/start').set(auth).send({ password: 'wrong' });
    expect(badPw.body.error.code).toBe('INVALID_CREDENTIALS');
    const start = await ctx.http().post('/admin/account/totp/start').set(auth).send({ password: a.password }).expect(200);
    expect(start.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    const on = await ctx.http().post('/admin/account/totp/confirm').set(auth).send({ setupToken: start.body.setupToken, totp: await generate({ secret: start.body.secret }) }).expect(200);
    expect(on.body.totpEnabled).toBe(true);
    const stored = await ctx.prisma.adminUser.findUniqueOrThrow({ where: { id: a.id } });
    expect(stored.totpSecret).not.toContain(start.body.secret); // encrypted at rest

    // now a code is required to sign in
    const step1 = await ctx.http().post('/admin/auth/login').send({ email: a.email, password: a.password }).expect(200);
    expect(step1.body).toEqual({ status: 'TOTP_REQUIRED' });

    await ctx.prisma.adminUser.update({ where: { id: a.id }, data: { totpLastStep: null } });
    const noCode = await ctx.http().post('/admin/account/totp/disable').set(auth).send({ password: a.password, totp: '000000' });
    expect(noCode.body.error.code).toBe('TOTP_INVALID');
    const off = await ctx.http().post('/admin/account/totp/disable').set(auth).send({ password: a.password, totp: await generate({ secret: start.body.secret }) }).expect(200);
    expect(off.body.totpEnabled).toBe(false);
    const again = await ctx.http().post('/admin/auth/login').send({ email: a.email, password: a.password }).expect(200);
    expect(again.body.status).toBe('OK');

    const actions = (await ctx.prisma.auditLog.findMany({ where: { entityId: a.id } })).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['ADMIN_TOTP_SETUP_STARTED', 'ADMIN_TOTP_ENABLED', 'ADMIN_TOTP_DISABLED']));
  });

  it('locks the account after 5 failed attempts', async () => {
    const a = await createAdmin(ctx, 'OPERATOR');
    for (let i = 0; i < 5; i++) await ctx.http().post('/admin/auth/login').send({ email: a.email, password: 'wrong' }).expect(401);
    const locked = await ctx.http().post('/admin/auth/login').send({ email: a.email, password: a.password });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('RATE_LIMITED');
  });

  it('expires idle sessions (session timeout)', async () => {
    const a = await createAdmin(ctx, 'SUPER_ADMIN');
    const token = await adminLogin(ctx, a);
    await ctx.http().get('/admin/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    await ctx.prisma.authSession.updateMany({
      where: { subjectId: a.id },
      data: { lastUsedAt: new Date(Date.now() - 31 * 60_000) },
    });
    const res = await ctx.http().get('/admin/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('keeps the player and admin token spaces separate', async () => {
    const p = await registerPlayer(ctx, 1);
    await ctx.http().get('/admin/auth/me').set('Authorization', `Bearer ${p.token}`).expect(401);
    const a = await createAdmin(ctx, 'OPERATOR');
    const adminToken = await adminLogin(ctx, a);
    await ctx.http().get('/me').set('Authorization', `Bearer ${adminToken}`).expect(401);
  });

  it('remembers the admin language (F0.3)', async () => {
    const a = await createAdmin(ctx, 'OPERATOR');
    const token = await adminLogin(ctx, a);
    const res = await ctx.http().patch('/admin/auth/me').set('Authorization', `Bearer ${token}`).send({ locale: 'en' }).expect(200);
    expect(res.body.locale).toBe('en');
  });
});
