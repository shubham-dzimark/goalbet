import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// a fake SMTP server: every connection the app opens is recorded
const transports: { options: unknown; sendMail: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[] = [];
let verifyError: Error | null = null;
vi.mock('nodemailer', () => ({
  createTransport: vi.fn((options: unknown) => {
    const t = {
      options,
      sendMail: vi.fn(async () => ({})),
      verify: vi.fn(async () => {
        if (verifyError) throw verifyError;
        return true;
      }),
      close: vi.fn(),
    };
    transports.push(t);
    return t;
  }),
}));

const { createTestApp, createAdmin, adminLogin, registerPlayer, resetDb } = await import('./helpers.js');
type Ctx = Awaited<ReturnType<typeof createTestApp>>;
let ctx: Ctx;
let superAdmin: Record<string, string>;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => {
  await resetDb(ctx);
  transports.length = 0;
  verifyError = null;
  superAdmin = { Authorization: `Bearer ${await adminLogin(ctx, await createAdmin(ctx, 'SUPER_ADMIN'))}` };
});

const settings = {
  enabled: true,
  host: 'smtp.example.com',
  port: 587,
  security: 'starttls',
  username: 'mailer@example.com',
  fromName: 'GoalBet',
  fromAddress: 'no-reply@goalbet.ro',
};
const PASSWORD = 'smtp-Secret-pass-123';
const forgot = (email: string) => ctx.http().post('/auth/forgot-password').send({ email });

describe('Admin → Email (SMTP settings)', () => {
  it('saves the settings with an encrypted password that is never returned or logged, and the mailer uses them at once', async () => {
    expect((await ctx.http().get('/admin/mail').set(superAdmin).expect(200)).body).toMatchObject({ source: 'none', password: { set: false } });

    const saved = await ctx.http().put('/admin/mail').set(superAdmin).send({ ...settings, password: PASSWORD, reason: 'Postmark account' }).expect(200);
    expect(saved.body).toMatchObject({ source: 'admin', host: 'smtp.example.com', port: 587, security: 'starttls', password: { set: true } });
    expect(JSON.stringify(saved.body)).not.toContain(PASSWORD);
    const row = await ctx.prisma.mailConfig.findUniqueOrThrow({ where: { id: 'default' } });
    expect(row.passwordEnc).toBeTruthy();
    expect(row.passwordEnc).not.toContain(PASSWORD);
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'MAIL_SETTINGS_UPDATED' } });
    expect(JSON.stringify(audit)).not.toContain(PASSWORD);
    expect(audit.after).toMatchObject({ password: 'replaced' });

    // a password reset goes out over that server, from that sender
    const p = await registerPlayer(ctx, 981);
    await forgot(p.email).expect(202);
    const t = transports.at(-1)!;
    expect(t.options).toMatchObject({ host: 'smtp.example.com', port: 587, secure: false, requireTLS: true, auth: { user: 'mailer@example.com', pass: PASSWORD } });
    expect(t.sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: '"GoalBet" <no-reply@goalbet.ro>', to: p.email }));
  });

  it('keeps the stored password when none is sent, and sends nothing when switched off', async () => {
    await ctx.http().put('/admin/mail').set(superAdmin).send({ ...settings, password: PASSWORD, reason: 'first setup' }).expect(200);
    const kept = await ctx.http().put('/admin/mail').set(superAdmin).send({ ...settings, port: 465, security: 'tls', reason: 'use port 465' }).expect(200);
    expect(kept.body).toMatchObject({ port: 465, security: 'tls', password: { set: true } });

    const p = await registerPlayer(ctx, 982);
    await forgot(p.email).expect(202);
    expect(transports.at(-1)!.options).toMatchObject({ port: 465, secure: true, auth: { pass: PASSWORD } });

    await ctx.http().put('/admin/mail').set(superAdmin).send({ ...settings, enabled: false, reason: 'pause email' }).expect(200);
    const sent = transports.reduce((n, x) => n + x.sendMail.mock.calls.length, 0);
    await forgot(p.email).expect(202);
    expect(transports.reduce((n, x) => n + x.sendMail.mock.calls.length, 0)).toBe(sent);
  });

  it('sends a test email with unsaved settings and reports the server error', async () => {
    const ok = await ctx.http().post('/admin/mail/test').set(superAdmin).send({ ...settings, password: PASSWORD, to: 'ops@goalbet.ro' }).expect(200);
    expect(ok.body).toEqual({ ok: true });
    expect(transports.at(-1)!.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ops@goalbet.ro', subject: 'GoalBet test email' }));
    expect(await ctx.prisma.mailConfig.count()).toBe(0);

    verifyError = new Error('535 Authentication failed');
    const bad = await ctx.http().post('/admin/mail/test').set(superAdmin).send({ ...settings, password: 'wrong', to: 'ops@goalbet.ro' }).expect(200);
    expect(bad.body).toEqual({ ok: false, error: '535 Authentication failed' });
    expect(await ctx.prisma.auditLog.count({ where: { action: 'MAIL_TEST_SENT' } })).toBe(2);
  });

  it('only Super admins can see or change it; bad input is refused', async () => {
    const op = { Authorization: `Bearer ${await adminLogin(ctx, await createAdmin(ctx, 'OPERATOR'))}` };
    await ctx.http().get('/admin/mail').set(op).expect(403);
    await ctx.http().put('/admin/mail').set(op).send({ ...settings, reason: 'x reason' }).expect(403);
    await ctx.http().put('/admin/mail').set(superAdmin).send({ ...settings, port: 70000, reason: 'bad port' }).expect(400);
    await ctx.http().put('/admin/mail').set(superAdmin).send({ ...settings, fromAddress: 'not-an-email', reason: 'bad from' }).expect(400);
  });
});
