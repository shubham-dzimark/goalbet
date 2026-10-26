import { Inject, Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { type AdminUser } from '@goalbet/db';
import { brandName } from '../../config/brand.js';
import { ENV, type Env } from '../../config/env.js';
import { AuditService } from '../../common/audit.service.js';
import { decryptSecret, encryptSecret, verifyAgainstDummy, verifyPassword } from '../../common/auth/crypto.js';
import { SessionService } from '../../common/auth/session.service.js';
import { TokensService } from '../../common/auth/tokens.service.js';
import { DomainError } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { type RequestMeta } from '../../common/request-meta.js';

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const TOTP_PERIOD_SEC = 30;

export interface AdminDto {
  id: string;
  email: string;
  name: string;
  role: string;
  locale: string;
}

const toDto = (a: AdminUser): AdminDto => ({ id: a.id, email: a.email, name: a.name, role: a.role, locale: a.locale });

/**
 * Verifies a 6-digit code against a plain TOTP secret. Codes at or before `lastStep` are refused
 * (replay protection); returns the accepted time step to store, or null.
 */
export async function checkAdminTotp(secret: string, code: string, lastStep: number | null): Promise<number | null> {
  const r = await verify({ secret, token: code, epochTolerance: TOTP_PERIOD_SEC, ...(lastStep !== null ? { afterTimeStep: lastStep } : {}) });
  return r.valid ? (r as { timeStep: number }).timeStep : null;
}

export type AdminLoginResult =
  | { status: 'OK'; accessToken: string; admin: AdminDto; refresh: { token: string; expiresAt: Date } }
  | { status: 'TOTP_REQUIRED' }
  | { status: 'TOTP_SETUP'; setupToken: string; otpauthUrl: string; qrDataUrl: string; secret: string };

/** F3.1 — admin login: email + password + TOTP, lockout, idle timeout, every attempt audited. */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get policy() {
    return { ttlMs: this.env.ADMIN_SESSION_MAX_HOURS * 3600_000, idleMs: this.env.ADMIN_IDLE_TIMEOUT_MIN * 60_000 };
  }

  private async fail(email: string, admin: AdminUser | null, reason: string, meta: RequestMeta) {
    if (admin) {
      const failed = admin.failedLogins + 1;
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: { failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MS) : admin.lockedUntil },
      });
    }
    await this.audit.log({
      category: 'ADMIN',
      action: 'ADMIN_LOGIN_FAILED',
      actor: { type: 'ADMIN', id: admin?.id ?? null, label: email, ...meta },
      entityType: 'AdminUser',
      entityId: admin?.id ?? null,
      meta: { reason },
    });
  }

  private checkTotp(admin: AdminUser, secret: string, code: string): Promise<number | null> {
    return checkAdminTotp(secret, code, admin.totpLastStep);
  }

  private async succeed(admin: AdminUser, meta: RequestMeta, timeStep: number): Promise<AdminLoginResult> {
    const updated = await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), totpLastStep: timeStep },
    });
    const session = await this.sessions.create('ADMIN', admin.id, meta, this.policy);
    await this.audit.log({
      category: 'ADMIN',
      action: 'ADMIN_LOGIN',
      actor: { type: 'ADMIN', id: admin.id, label: admin.email, ...meta },
      entityType: 'AdminUser',
      entityId: admin.id,
    });
    return {
      status: 'OK',
      accessToken: this.tokens.signAdmin({ sub: admin.id, role: admin.role, sid: session.sessionId, email: admin.email }),
      admin: toDto(updated),
      refresh: session,
    };
  }

  async login(input: { email: string; password: string; totp?: string | undefined }, meta: RequestMeta) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email: input.email } });
    if (!admin) {
      await verifyAgainstDummy(input.password);
      await this.fail(input.email, null, 'unknown_email', meta);
      throw new DomainError('INVALID_CREDENTIALS');
    }
    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      await this.fail(input.email, admin, 'locked', meta);
      throw new DomainError('RATE_LIMITED');
    }
    if (!(await verifyPassword(admin.passwordHash, input.password))) {
      await this.fail(input.email, admin, 'bad_password', meta);
      throw new DomainError('INVALID_CREDENTIALS');
    }
    if (admin.status !== 'ACTIVE') {
      await this.fail(input.email, admin, 'suspended', meta);
      throw new DomainError('ACCOUNT_SUSPENDED');
    }

    // First login: enrol an authenticator before any session is issued.
    if (!admin.totpEnabled || !admin.totpSecret) {
      const secret = generateSecret();
      const otpauthUrl = generateURI({ issuer: `${brandName} Admin`, label: admin.email, secret });
      await this.audit.log({
        category: 'ADMIN',
        action: 'ADMIN_TOTP_SETUP_STARTED',
        actor: { type: 'ADMIN', id: admin.id, label: admin.email, ...meta },
        entityType: 'AdminUser',
        entityId: admin.id,
      });
      return {
        status: 'TOTP_SETUP',
        setupToken: this.tokens.signTotpSetup(admin.id, encryptSecret(secret, this.env.JWT_ADMIN_SECRET)),
        otpauthUrl,
        qrDataUrl: await QRCode.toDataURL(otpauthUrl),
        secret,
      } satisfies AdminLoginResult;
    }

    if (!input.totp) return { status: 'TOTP_REQUIRED' } satisfies AdminLoginResult;
    const step = await this.checkTotp(admin, decryptSecret(admin.totpSecret, this.env.JWT_ADMIN_SECRET), input.totp);
    if (step === null) {
      await this.fail(input.email, admin, 'bad_totp', meta);
      throw new DomainError('TOTP_INVALID');
    }
    return this.succeed(admin, meta, step);
  }

  async enableTotp(setupToken: string, code: string, meta: RequestMeta) {
    let payload;
    try {
      payload = this.tokens.verifyTotpSetup(setupToken);
    } catch {
      throw new DomainError('INVALID_TOKEN');
    }
    const admin = await this.prisma.adminUser.findUnique({ where: { id: payload.sub } });
    if (!admin || admin.status !== 'ACTIVE') throw new DomainError('UNAUTHORIZED');
    const secret = decryptSecret(payload.secret, this.env.JWT_ADMIN_SECRET);
    const step = await this.checkTotp({ ...admin, totpLastStep: null }, secret, code);
    if (step === null) {
      await this.fail(admin.email, admin, 'bad_totp_setup', meta);
      throw new DomainError('TOTP_INVALID');
    }
    const enabled = await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { totpSecret: payload.secret, totpEnabled: true },
    });
    await this.audit.log({
      category: 'ADMIN',
      action: 'ADMIN_TOTP_ENABLED',
      actor: { type: 'ADMIN', id: admin.id, label: admin.email, ...meta },
      entityType: 'AdminUser',
      entityId: admin.id,
    });
    return this.succeed(enabled, meta, step);
  }

  async refresh(token: string | undefined) {
    const rotated = await this.sessions.rotate('ADMIN', token, this.policy);
    const admin = await this.prisma.adminUser.findUnique({ where: { id: rotated.subjectId } });
    if (!admin || admin.status !== 'ACTIVE') {
      await this.sessions.revoke(rotated.token);
      throw new DomainError('UNAUTHORIZED');
    }
    return {
      accessToken: this.tokens.signAdmin({ sub: admin.id, role: admin.role, sid: rotated.sessionId, email: admin.email }),
      admin: toDto(admin),
      refresh: rotated,
    };
  }

  async logout(token: string | undefined, adminId: string | null, meta: RequestMeta) {
    await this.sessions.revoke(token);
    if (adminId) {
      await this.audit.log({
        category: 'ADMIN',
        action: 'ADMIN_LOGOUT',
        actor: { type: 'ADMIN', id: adminId, ...meta },
        entityType: 'AdminUser',
        entityId: adminId,
      });
    }
  }

  async me(adminId: string) {
    return toDto(await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } }));
  }

  async setLocale(adminId: string, locale: 'ro' | 'en') {
    return toDto(await this.prisma.adminUser.update({ where: { id: adminId }, data: { locale } }));
  }
}
