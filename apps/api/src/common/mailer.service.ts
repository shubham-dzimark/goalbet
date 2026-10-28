import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Transporter } from 'nodemailer';
import { MailConfigService, formatFrom } from './mail-config.service.js';
import { ENV, type Env } from '../config/env.js';
import { RedisService } from './redis.service.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

const DEV_MAILBOX = 'dev:mailbox';

/**
 * Outbound email over SMTP with the settings from Admin → Email (or SMTP_URL until an admin saves
 * them); with neither, or when switched off, mails are only logged. Outside production they are
 * also kept in a Redis "dev mailbox" so tests can read password-reset links.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger('Mailer');
  private current: { version: string; transport: Transporter | null; from: string } | null = null;

  constructor(
    private readonly redis: RedisService,
    @Inject(ENV) private readonly env: Env,
    private readonly config: MailConfigService,
  ) {}

  /** The connection for the current settings, rebuilt when an admin changes them. */
  private async connection() {
    const cfg = await this.config.effective();
    if (this.current?.version !== cfg.version || (this.current.transport === null) !== !cfg.enabled) {
      this.current?.transport?.close();
      this.current = { version: cfg.version, transport: this.config.transportFor(cfg), from: formatFrom(cfg.fromName, cfg.fromAddress) };
    }
    return this.current;
  }

  async send(mail: Mail) {
    const { transport, from } = await this.connection();
    this.logger.log({ mailTo: mail.to, subject: mail.subject, via: transport ? 'smtp' : 'log-only' });
    if (transport) {
      // a failed send is logged, never shown to the requester (no account enumeration)
      await transport
        .sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text })
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
