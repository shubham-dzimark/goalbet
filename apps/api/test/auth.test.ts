import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestContext, createTestApp, registerPlayer, resetDb, validRegistration } from './helpers.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

describe('F1.3 Register', () => {
  it('creates a player with exactly name/email/phone/password (+DOB, terms), a 0 RON wallet and an audit entry', async () => {
    const body = validRegistration(1);
    const res = await ctx.http().post('/auth/register').send(body).expect(201);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ name: 'Test Player', email: body.email, phone: '+40700000001', balanceBani: 0 });
    expect(res.headers['set-cookie']?.[0]).toMatch(/^gb_rt=.*HttpOnly/);

    const wallet = await ctx.prisma.wallet.findFirstOrThrow({ where: { userId: res.body.user.id } });
    expect(wallet.balanceBani).toBe(0);
    const audit = await ctx.prisma.auditLog.findFirst({ where: { action: 'USER_REGISTERED', entityId: res.body.user.id } });
    expect(audit?.category).toBe('SYSTEM');
  });

  it('validates formats and returns localisable field keys', async () => {
    const res = await ctx
      .http()
      .post('/auth/register')
      .send({ ...validRegistration(2), email: 'nope', phone: '12', password: 'abc', acceptTerms: false })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields).toMatchObject({
      email: 'validation.email',
      phone: 'validation.phone',
      password: 'validation.passwordLength',
      acceptTerms: 'validation.terms',
    });
  });

  it('enforces the 18+ check', async () => {
    const year = new Date().getUTCFullYear() - 17;
    const res = await ctx
      .http()
      .post('/auth/register')
      .send({ ...validRegistration(3), dateOfBirth: `${year}-01-01` })
      .expect(400);
    expect(res.body.error.details.fields.dateOfBirth).toBe('validation.underage');
  });

  it('requires unique email and phone', async () => {
    const first = validRegistration(4);
    await ctx.http().post('/auth/register').send(first).expect(201);
    const dupEmail = await ctx.http().post('/auth/register').send({ ...validRegistration(5), email: first.email }).expect(409);
    expect(dupEmail.body.error.code).toBe('EMAIL_TAKEN');
    const dupPhone = await ctx.http().post('/auth/register').send({ ...validRegistration(6), phone: first.phone }).expect(409);
    expect(dupPhone.body.error.code).toBe('PHONE_TAKEN');
  });
});

describe('F1.2 Login', () => {
  it('logs in with email + password and audits success and failure', async () => {
    const p = await registerPlayer(ctx, 10);
    const bad = await ctx.http().post('/auth/login').send({ email: p.email, password: 'wrong-pass1' }).expect(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
    const ok = await ctx.http().post('/auth/login').send({ email: p.email.toUpperCase(), password: p.password }).expect(200);
    expect(ok.body.user.id).toBe(p.id);

    const me = await ctx.http().get('/me').set('Authorization', `Bearer ${ok.body.accessToken}`).expect(200);
    expect(me.body.email).toBe(p.email);
    const actions = (await ctx.prisma.auditLog.findMany({ where: { entityId: p.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['USER_LOGIN', 'USER_LOGIN_FAILED']));
  });

  it('does not reveal whether the email exists', async () => {
    const res = await ctx.http().post('/auth/login').send({ email: 'ghost@example.com', password: 'whatever1' }).expect(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('is rate-limited per client', async () => {
    const agent = ctx.http();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      codes.push((await agent.post('/auth/login').send({ email: 'x@example.com', password: 'nope1234' })).status);
    }
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
  });

  it('blocks suspended players', async () => {
    const p = await registerPlayer(ctx, 11);
    await ctx.prisma.user.update({ where: { id: p.id }, data: { status: 'SUSPENDED' } });
    const res = await ctx.http().post('/auth/login').send({ email: p.email, password: p.password }).expect(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('rotates the refresh cookie and kills the session family on token reuse', async () => {
    const cookieOf = (res: { headers: Record<string, unknown> }) =>
      (res.headers['set-cookie'] as string[])[0]!.split(';')[0]!;
    const refresh = (cookie: string) => ctx.http().post('/auth/refresh').set('Cookie', cookie);

    const a = cookieOf(await ctx.http().post('/auth/register').send(validRegistration(12)).expect(201));
    const b = cookieOf(await refresh(a).expect(200));
    expect(b).not.toBe(a);

    // A parallel refresh with the just-replaced token (second tab) is refused but harmless.
    await refresh(a).expect(401);
    const c = cookieOf(await refresh(b).expect(200));

    // Later, replaying a replaced token is treated as theft: every session of the user ends.
    await ctx.prisma.authSession.updateMany({ data: { lastUsedAt: new Date(Date.now() - 60_000) } });
    const reuse = await refresh(b).expect(401);
    expect(reuse.body.error.code).toBe('SESSION_EXPIRED');
    const legit = await refresh(c).expect(401);
    expect(legit.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('forgot / reset password via emailed link; old sessions are revoked', async () => {
    const p = await registerPlayer(ctx, 13);
    await ctx.http().post('/auth/forgot-password').send({ email: p.email }).expect(202);
    await ctx.http().post('/auth/forgot-password').send({ email: 'nobody@example.com' }).expect(202);
    const mails = (await ctx.http().get('/dev/mailbox').query({ to: p.email }).expect(200)).body;
    const token = new URL(mails[0].text).searchParams.get('token')!;

    await ctx.http().post('/auth/reset-password').send({ token, password: 'NewParola9' }).expect(200);
    const reuse = await ctx.http().post('/auth/reset-password').send({ token, password: 'NewParola9' }).expect(400);
    expect(reuse.body.error.code).toBe('INVALID_TOKEN');
    await ctx.http().post('/auth/login').send({ email: p.email, password: p.password }).expect(401);
    await ctx.http().post('/auth/login').send({ email: p.email, password: 'NewParola9' }).expect(200);
  });
});

describe('F0.3 language remembered per user', () => {
  it('stores the locale on the profile', async () => {
    const p = await registerPlayer(ctx, 20);
    const res = await ctx.http().patch('/me').set('Authorization', `Bearer ${p.token}`).send({ locale: 'en' }).expect(200);
    expect(res.body.locale).toBe('en');
    const again = await ctx.http().post('/auth/login').send({ email: p.email, password: p.password }).expect(200);
    expect(again.body.user.locale).toBe('en');
  });
});
