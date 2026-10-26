import { Inject, Injectable } from '@nestjs/common';
import { generateSecret, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { type AdminRole, type AdminUser } from '@goalbet/db';
import { type AdminAccount, type AdminTempPassword, type AdminTotpSetup, type AdminUserAccountRow } from '@goalbet/shared';
import { brandName } from '../../config/brand.js';
import { ENV, type Env } from '../../config/env.js';
import { type Actor, AuditService } from '../../common/audit.service.js';
import { decryptSecret, encryptSecret, hashPassword, randomToken, verifyPassword } from '../../common/auth/crypto.js';
import { TokensService } from '../../common/auth/tokens.service.js';
import { DomainError } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { checkAdminTotp } from './admin-auth.service.js';

const toRow = (a: AdminUser): AdminUserAccountRow => ({
  id: a.id,
  name: a.name,
  email: a.email,
  role: a.role,
  status: a.status,
  totpEnabled: a.totpEnabled && !!a.totpSecret,
  locked: !!a.lockedUntil && a.lockedUntil.getTime() > Date.now(),
  lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
  createdAt: a.createdAt.toISOString(),
});

/**
 * Admin accounts (F3.1): an admin's own settings (name, password, moving 2FA, sessions) and,
 * for Super admins, managing the other admins. Every change is audited; sessions end whenever
 * a role, password, 2FA secret or status changes, so stale logins can't keep old rights.
 */
@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: TokensService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async get(id: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!admin) throw new DomainError('NOT_FOUND');
    return admin;
  }

  /** Ends the admin's sessions, optionally keeping the one making the request. */
  private async endSessions(adminId: string, keepSessionId?: string) {
    await this.prisma.authSession.updateMany({
      where: { subjectType: 'ADMIN', subjectId: adminId, revokedAt: null, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }

  /** Accepts a code from the admin's current authenticator and records its time step (no replay). */
  private async requireTotp(admin: AdminUser, code: string) {
    if (!admin.totpSecret) throw new DomainError('TOTP_INVALID');
    const step = await checkAdminTotp(decryptSecret(admin.totpSecret, this.env.JWT_ADMIN_SECRET), code, admin.totpLastStep);
    if (step === null) throw new DomainError('TOTP_INVALID');
    await this.prisma.adminUser.update({ where: { id: admin.id }, data: { totpLastStep: step } });
  }

  // ── own account ──
  async account(adminId: string, sessionId: string): Promise<AdminAccount> {
    const a = await this.get(adminId);
    const idleSince = new Date(Date.now() - this.env.ADMIN_IDLE_TIMEOUT_MIN * 60_000);
    const sessions = await this.prisma.authSession.findMany({
      where: { subjectType: 'ADMIN', subjectId: adminId, revokedAt: null, expiresAt: { gt: new Date() }, lastUsedAt: { gt: idleSince } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return {
      id: a.id,
      name: a.name,
      email: a.email,
      role: a.role,
      locale: a.locale,
      totpEnabled: a.totpEnabled && !!a.totpSecret,
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      sessions: sessions.map((s) => ({
        id: s.id,
        ip: s.ip,
        userAgent: s.userAgent,
        createdAt: s.createdAt.toISOString(),
        lastUsedAt: s.lastUsedAt.toISOString(),
        current: s.id === sessionId,
      })),
    };
  }

  async rename(actor: Actor & { id: string }, sessionId: string, name: string) {
    const before = await this.get(actor.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({ where: { id: actor.id }, data: { name } });
      await this.audit.log({ category: 'ADMIN', action: 'ADMIN_PROFILE_UPDATED', actor, entityType: 'AdminUser', entityId: actor.id, before: { name: before.name }, after: { name } }, tx);
    });
    return this.account(actor.id, sessionId);
  }

  async changePassword(actor: Actor & { id: string }, sessionId: string, input: { currentPassword: string; newPassword: string; totp: string }) {
    const admin = await this.get(actor.id);
    if (!(await verifyPassword(admin.passwordHash, input.currentPassword))) {
      await this.audit.log({ category: 'ADMIN', action: 'ADMIN_PASSWORD_CHANGE_FAILED', actor, entityType: 'AdminUser', entityId: admin.id, meta: { reason: 'bad_password' } });
      throw new DomainError('INVALID_CREDENTIALS');
    }
    await this.requireTotp(admin, input.totp);
    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({ where: { id: admin.id }, data: { passwordHash: await hashPassword(input.newPassword) } });
      await this.audit.log({ category: 'ADMIN', action: 'ADMIN_PASSWORD_CHANGED', actor, entityType: 'AdminUser', entityId: admin.id }, tx);
    });
    await this.endSessions(admin.id, sessionId);
    return this.account(admin.id, sessionId);
  }

  /** Step 1 of moving 2FA to a new phone: prove the current authenticator, get a new QR. */
  async startTotpChange(actor: Actor & { id: string }, code: string): Promise<AdminTotpSetup> {
    const admin = await this.get(actor.id);
    await this.requireTotp(admin, code);
    const secret = generateSecret();
    const otpauthUrl = generateURI({ issuer: `${brandName} Admin`, label: admin.email, secret });
    await this.audit.log({ category: 'ADMIN', action: 'ADMIN_TOTP_CHANGE_STARTED', actor, entityType: 'AdminUser', entityId: admin.id });
    return {
      setupToken: this.tokens.signTotpSetup(admin.id, encryptSecret(secret, this.env.JWT_ADMIN_SECRET)),
      otpauthUrl,
      qrDataUrl: await QRCode.toDataURL(otpauthUrl),
      secret,
    };
  }

  /** Step 2: a code from the new authenticator switches the secret; other sessions end. */
  async confirmTotpChange(actor: Actor & { id: string }, sessionId: string, setupToken: string, code: string) {
    let payload;
    try {
      payload = this.tokens.verifyTotpSetup(setupToken);
    } catch {
      throw new DomainError('INVALID_TOKEN');
    }
    if (payload.sub !== actor.id) throw new DomainError('INVALID_TOKEN');
    const step = await checkAdminTotp(decryptSecret(payload.secret, this.env.JWT_ADMIN_SECRET), code, null);
    if (step === null) throw new DomainError('TOTP_INVALID');
    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({ where: { id: actor.id }, data: { totpSecret: payload.secret, totpEnabled: true, totpLastStep: step } });
      await this.audit.log({ category: 'ADMIN', action: 'ADMIN_TOTP_CHANGED', actor, entityType: 'AdminUser', entityId: actor.id }, tx);
    });
    await this.endSessions(actor.id, sessionId);
    return this.account(actor.id, sessionId);
  }

  async endSession(actor: Actor & { id: string }, currentSessionId: string, target: string | 'others') {
    if (target === 'others') {
      await this.endSessions(actor.id, currentSessionId);
    } else {
      if (target === currentSessionId) throw new DomainError('SELF_ACTION');
      await this.prisma.authSession.updateMany({ where: { id: target, subjectType: 'ADMIN', subjectId: actor.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.audit.log({ category: 'ADMIN', action: 'ADMIN_SESSIONS_ENDED', actor, entityType: 'AdminUser', entityId: actor.id, meta: { target } });
    return this.account(actor.id, currentSessionId);
  }

  // ── Super admin: other admins ──
  async list(): Promise<AdminUserAccountRow[]> {
    const rows = await this.prisma.adminUser.findMany({ orderBy: [{ status: 'asc' }, { role: 'asc' }, { name: 'asc' }] });
    return rows.map(toRow);
  }

  /** At least one active Super admin must remain after the change. */
  private async keepASuperAdmin(target: AdminUser, next: { role?: AdminRole; status?: 'ACTIVE' | 'SUSPENDED' }) {
    const losesSuper = target.role === 'SUPER_ADMIN' && target.status === 'ACTIVE' && ((next.role && next.role !== 'SUPER_ADMIN') || next.status === 'SUSPENDED');
    if (!losesSuper) return;
    const others = await this.prisma.adminUser.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: target.id } } });
    if (others === 0) throw new DomainError('LAST_SUPER_ADMIN');
  }

  async create(actor: Actor & { id: string }, input: { name: string; email: string; role: AdminRole }): Promise<AdminTempPassword> {
    if (await this.prisma.adminUser.findUnique({ where: { email: input.email } })) throw new DomainError('EMAIL_TAKEN');
    const temporaryPassword = `${randomToken(9)}7`;
    const admin = await this.prisma.$transaction(async (tx) => {
      const created = await tx.adminUser.create({
        data: { name: input.name, email: input.email, role: input.role, passwordHash: await hashPassword(temporaryPassword), totpEnabled: false },
      });
      await this.audit.log({ category: 'ADMIN', action: 'ADMIN_CREATED', actor, entityType: 'AdminUser', entityId: created.id, after: { name: input.name, email: input.email, role: input.role } }, tx);
      return created;
    });
    return { admin: toRow(admin), temporaryPassword };
  }

  async update(actor: Actor & { id: string }, id: string, input: { name?: string | undefined; email?: string | undefined; role?: AdminRole | undefined; reason: string }) {
    const target = await this.get(id);
    if (input.role && input.role !== target.role && id === actor.id) throw new DomainError('SELF_ACTION');
    if (input.role) await this.keepASuperAdmin(target, { role: input.role });
    if (input.email && input.email !== target.email && (await this.prisma.adminUser.findUnique({ where: { email: input.email } }))) {
      throw new DomainError('EMAIL_TAKEN');
    }
    const data = Object.fromEntries(Object.entries({ name: input.name, email: input.email, role: input.role }).filter(([, v]) => v !== undefined));
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.adminUser.update({ where: { id }, data });
      await this.audit.log(
        {
          category: 'ADMIN',
          action: 'ADMIN_UPDATED',
          actor,
          entityType: 'AdminUser',
          entityId: id,
          before: { name: target.name, email: target.email, role: target.role },
          after: data,
          meta: { reason: input.reason },
        },
        tx,
      );
      return row;
    });
    // a new role or email must take effect at once: their current tokens carry the old ones
    if ((input.role && input.role !== target.role) || (input.email && input.email !== target.email)) await this.endSessions(id);
    return toRow(updated);
  }

  async setStatus(actor: Actor & { id: string }, id: string, status: 'ACTIVE' | 'SUSPENDED', reason: string) {
    if (id === actor.id) throw new DomainError('SELF_ACTION');
    const target = await this.get(id);
    await this.keepASuperAdmin(target, { status });
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.adminUser.update({
        where: { id },
        data: { status, ...(status === 'ACTIVE' ? { failedLogins: 0, lockedUntil: null } : {}) },
      });
      await this.audit.log(
        { category: 'ADMIN', action: status === 'SUSPENDED' ? 'ADMIN_SUSPENDED' : 'ADMIN_ACTIVATED', actor, entityType: 'AdminUser', entityId: id, before: { status: target.status }, after: { status }, meta: { reason } },
        tx,
      );
      return row;
    });
    if (status === 'SUSPENDED') await this.endSessions(id);
    return toRow(updated);
  }

  /** New temporary password (shown once); also clears a lockout. */
  async resetPassword(actor: Actor & { id: string }, id: string, reason: string): Promise<AdminTempPassword> {
    if (id === actor.id) throw new DomainError('SELF_ACTION');
    await this.get(id);
    const temporaryPassword = `${randomToken(9)}7`;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.adminUser.update({ where: { id }, data: { passwordHash: await hashPassword(temporaryPassword), failedLogins: 0, lockedUntil: null } });
      await this.audit.log({ category: 'ADMIN', action: 'ADMIN_PASSWORD_RESET', actor, entityType: 'AdminUser', entityId: id, meta: { reason } }, tx);
      return row;
    });
    await this.endSessions(id);
    return { admin: toRow(updated), temporaryPassword };
  }

  /** Unlinks the authenticator: the admin scans a new QR code at the next login. */
  async resetTotp(actor: Actor & { id: string }, id: string, reason: string) {
    if (id === actor.id) throw new DomainError('SELF_ACTION');
    await this.get(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.adminUser.update({ where: { id }, data: { totpSecret: null, totpEnabled: false, totpLastStep: null } });
      await this.audit.log({ category: 'ADMIN', action: 'ADMIN_2FA_RESET', actor, entityType: 'AdminUser', entityId: id, meta: { reason } }, tx);
      return row;
    });
    await this.endSessions(id);
    return toRow(updated);
  }
}
