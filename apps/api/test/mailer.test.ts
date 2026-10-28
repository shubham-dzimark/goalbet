import { describe, expect, it, vi } from 'vitest';

const sendMail = vi.fn();
vi.mock('nodemailer', () => ({ createTransport: vi.fn(() => ({ sendMail })) }));

const { MailerService } = await import('../src/common/mailer.service.js');
type Ctor = ConstructorParameters<typeof MailerService>;
const redis = { client: { lpush: vi.fn(), ltrim: vi.fn() } } as unknown as Ctor[0];
const env = (over: object) => ({ NODE_ENV: 'production', MAIL_FROM: 'GoalBet <no-reply@goalbet.test>', ...over }) as unknown as Ctor[1];

describe('outgoing email', () => {
  it('sends over SMTP when SMTP_URL is set', async () => {
    sendMail.mockResolvedValueOnce({});
    const mailer = new MailerService(redis, env({ SMTP_URL: 'smtp://localhost:2525' }));
    await mailer.send({ to: 'player@example.com', subject: 'Reset', text: 'link' });
    expect(sendMail).toHaveBeenCalledWith({ from: 'GoalBet <no-reply@goalbet.test>', to: 'player@example.com', subject: 'Reset', text: 'link' });
  });

  it('a failing SMTP server is logged, not thrown to the requester', async () => {
    sendMail.mockRejectedValueOnce(new Error('connection refused'));
    const mailer = new MailerService(redis, env({ SMTP_URL: 'smtp://localhost:2525' }));
    await expect(mailer.send({ to: 'player@example.com', subject: 'Reset', text: 'link' })).resolves.toBeUndefined();
  });

  it('without SMTP_URL nothing is sent', async () => {
    sendMail.mockClear();
    await new MailerService(redis, env({})).send({ to: 'a@b.c', subject: 's', text: 't' });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
