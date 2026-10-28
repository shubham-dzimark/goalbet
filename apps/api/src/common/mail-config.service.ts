import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Transporter, createTransport } from 'nodemailer';
import { type AdminMailStatus, type AdminMailTestResult, type AdminMailUpdateInput } from '@goalbet/shared';
import { ENV, type Env } from '../config/env.js';
import { type Actor, AuditService } from './audit.service.js';
import { decryptSecret, encryptSecret } from './auth/crypto.js';
import { PrismaService } from './prisma.service.js';
import { Channels, RedisService } from './redis.service.js';

type Security = AdminMailStatus['security'];

interface SmtpSettings {
  host: string;
  port: number;
  security: Security;
  username: string;
  password: string | null;
  fromName: string;
  fromAddress: string;
}

export interface EffectiveMailConfig extends Omit<AdminMailStatus, 'password'> {
  password: string | null;
  /** SMTP_URL as given (env fallback keeps nodemailer's own URL semantics) */
  url: string | null;
  /** changes whenever the settings change; the mailer rebuilds its connection on a new version */
  version: string;
}

const CACHE_MS = 15_000;

/** "GoalBet <no-reply@x.ro>" → name + address */
function parseFrom(from: string) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m ? { fromName: m[1]!.replace(/^"|"$/g, ''), fromAddress: m[2]! } : { fromName: '', fromAddress: from.trim() };
}

/** nodemailer options for host / port / security / login (timeouts so a dead server can't hang a request). */
export function transportOptions(s: SmtpSettings) {
  return {
    host: s.host,
    port: s.port,
    secure: s.security === 'tls',
    requireTLS: s.security === 'starttls',
    ignoreTLS: s.security === 'none',
    ...(s.username ? { auth: { user: s.username, pass: s.password ?? '' } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

export const formatFrom = (name: string, address: string) => (name ? `"${name.replace(/"/g, '')}" <${address}>` : address);

/**
 * Outgoing email settings (Super admin → Email). One row with the SMTP password sealed by
 * AES-256-GCM; every API process re-reads it within 15 s, or at once on a Redis notice, so no
 * restart is needed. Until an admin saves settings, SMTP_URL / MAIL_FROM from the environment
 * are used; with neither, emails are only logged.
 */
@Injectable()
export class MailConfigService implements OnModuleInit {
  private readonly logger = new Logger('MailConfig');
  private cache: { at: number; value: EffectiveMailConfig } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit() {
    await this.redis.subscribe(Channels.MAIL_CHANGED, () => this.invalidate());
  }

  invalidate() {
    this.cache = null;
  }

  private get keyMaterial() {
    // its own derivation, separate from the 2FA secrets and the data-provider key
    return `${this.env.JWT_ADMIN_SECRET}:smtp-password`;
  }

  private fromEnv(): EffectiveMailConfig {
    const from = parseFrom(this.env.MAIL_FROM);
    const base = { enabled: false, host: '', port: 587, security: 'starttls' as Security, username: '', password: null, ...from, updatedAt: null };
    if (!this.env.SMTP_URL) return { ...base, source: 'none', url: null, version: 'none' };
    try {
      const u = new URL(this.env.SMTP_URL);
      const tls = u.protocol === 'smtps:';
      return {
        ...base,
        source: 'env',
        enabled: true,
        host: u.hostname,
        port: Number(u.port) || (tls ? 465 : 587),
        security: tls ? 'tls' : 'starttls',
        username: decodeURIComponent(u.username),
        password: u.password ? decodeURIComponent(u.password) : null,
        url: this.env.SMTP_URL,
        version: 'env',
      };
    } catch {
      this.logger.error('SMTP_URL is not a valid URL; emails are only logged');
      return { ...base, source: 'none', url: null, version: 'none' };
    }
  }

  async effective(): Promise<EffectiveMailConfig> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const row = await this.prisma.mailConfig.findUnique({ where: { id: 'default' } }).catch(() => null);
    let value = this.fromEnv();
    if (row) {
      let password: string | null = null;
      if (row.passwordEnc) {
        try {
          password = decryptSecret(row.passwordEnc, this.keyMaterial);
        } catch {
          this.logger.error('stored SMTP password cannot be decrypted (server secret changed?)');
        }
      }
      value = {
        source: 'admin',
        enabled: row.enabled,
        host: row.host,
        port: row.port,
        security: row.security as Security,
        username: row.username ?? '',
        password,
        fromName: row.fromName,
        fromAddress: row.fromAddress,
        updatedAt: row.updatedAt.toISOString(),
        url: null,
        version: `admin:${row.updatedAt.getTime()}`,
      };
    }
    this.cache = { at: Date.now(), value };
    return value;
  }

  async status(): Promise<AdminMailStatus> {
    const { password, url: _url, version: _v, ...rest } = await this.effective();
    return { ...rest, password: { set: !!password } };
  }

  /** A connection for these settings, or null when email is off (log only). */
  transportFor(cfg: EffectiveMailConfig): Transporter | null {
    if (!cfg.enabled) return null;
    if (cfg.url) return createTransport(cfg.url);
    return createTransport(transportOptions(cfg));
  }

  /** Save from the admin panel. `password`: string = replace, null = remove, undefined = keep. */
  async save(actor: Actor & { id: string }, input: Omit<AdminMailUpdateInput, 'username'> & { username: string }) {
    const before = await this.status();
    const passwordChange =
      input.password === undefined ? {} : input.password === null ? { passwordEnc: null } : { passwordEnc: encryptSecret(input.password, this.keyMaterial) };
    const data = {
      enabled: input.enabled,
      host: input.host,
      port: input.port,
      security: input.security,
      username: input.username || null,
      fromName: input.fromName,
      fromAddress: input.fromAddress,
      updatedById: actor.id,
      ...passwordChange,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.mailConfig.upsert({ where: { id: 'default' }, create: { id: 'default', ...data }, update: data });
      await this.audit.log(
        {
          category: 'ADMIN',
          action: 'MAIL_SETTINGS_UPDATED',
          actor,
          entityType: 'MailConfig',
          entityId: 'default',
          // the password itself is never logged, only whether it changed
          before: { ...before, password: before.password.set ? 'set' : 'none' },
          after: {
            enabled: input.enabled,
            host: input.host,
            port: input.port,
            security: input.security,
            username: input.username,
            password: input.password === undefined ? 'unchanged' : input.password === null ? 'removed' : 'replaced',
            fromName: input.fromName,
            fromAddress: input.fromAddress,
          },
          meta: { reason: input.reason },
        },
        tx,
      );
    });
    this.cache = null;
    await this.redis.publish(Channels.MAIL_CHANGED, { at: Date.now() });
    return this.status();
  }

  /**
   * Connects with the given settings (unsaved; no password = the stored one) and sends a test
   * email. Nothing is stored. The SMTP server's answer is returned so the admin can fix typos.
   */
  async test(actor: Actor, input: SmtpSettings & { to: string }): Promise<AdminMailTestResult> {
    const stored = await this.effective();
    const settings = { ...input, password: input.password || stored.password };
    const transport = createTransport(transportOptions(settings));
    let result: AdminMailTestResult;
    try {
      await transport.verify();
      await transport.sendMail({
        from: formatFrom(settings.fromName, settings.fromAddress),
        to: input.to,
        subject: 'GoalBet test email',
        text: 'This is a test email from the GoalBet admin panel. If you can read it, outgoing email works.',
      });
      result = { ok: true };
    } catch (e) {
      result = { ok: false, error: (e as Error).message };
    } finally {
      transport.close();
    }
    await this.audit
      .log({
        category: 'ADMIN',
        action: 'MAIL_TEST_SENT',
        actor,
        entityType: 'MailConfig',
        entityId: 'default',
        meta: { to: input.to, host: input.host, port: input.port, ok: result.ok, ...(result.error ? { error: result.error.slice(0, 300) } : {}) },
      })
      .catch(() => undefined);
    return result;
  }
}
