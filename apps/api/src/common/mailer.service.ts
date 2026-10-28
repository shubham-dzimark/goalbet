import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Transporter, createTransport } from 'nodemailer';
import { ENV, type Env } from '../config/env.js';
import { RedisService } from './redis.service.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

const DEV_MAILBOX = 'dev:mailbox';

/**
 * Outbound email. With SMTP_URL set, mails go out over SMTP (any provider: SES, Postmark,
 * Mailgun, SendGrid, Brevo… all offer SMTP); without it they are only logged. Outside production
 * they are also kept in a Redis "dev mailbox" so tests can read password-reset links.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger('Mailer');

  private readonly transport: Transporter | null;

  constructor(
    private readonly redis: RedisService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.transport = env.SMTP_URL ? createTransport(env.SMTP_URL) : null;
  }

  async send(mail: Mail) {
    this.logger.log({ mailTo: mail.to, subject: mail.subject, via: this.transport ? 'smtp' : 'log-only' });
    if (this.transport) {
      // a failed send is logged, never shown to the requester (no account enumeration)
      await this.transport
        .sendMail({ from: this.env.MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text })
        .catch((e: Error) => this.logger.error({ mailTo: mail.to, subject: mail.subject, error: e.message }));
    }
    if (this.env.NODE_ENV !== 'production') {
      await this.redis.client.lpush(DEV_MAILBOX, JSON.stringify({ ...mail, at: new Date().toISOString() }));
      await this.redis.client.ltrim(DEV_MAILBOX, 0, 49);
    }
  }

  async devMailbox(to?: string): Promise<(Mail & { at: string })[]> {
    const raw = await this.redis.client.lrange(DEV_MAILBOX, 0, 49);
    const mails = raw.map((r) => JSON.parse(r) as Mail & { at: string });
    return to ? mails.filter((m) => m.to === to) : mails;
  }
}
