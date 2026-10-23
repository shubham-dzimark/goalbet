import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { RedisService } from './redis.service.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

const DEV_MAILBOX = 'dev:mailbox';

/**
 * Outbound email. No provider is wired in the MVP: mails are logged, and outside production they
 * are also kept in a Redis "dev mailbox" so E2E tests can read password-reset links.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger('Mailer');

  constructor(
    private readonly redis: RedisService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async send(mail: Mail) {
    this.logger.log({ mailTo: mail.to, subject: mail.subject });
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
