import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@goalbet/db';
import { type z } from 'zod';
import { type loginSchema, type registerSchema, type resetPasswordSchema } from '@goalbet/shared';
import { ENV, type Env } from '../../config/env.js';
import { AuditService } from '../../common/audit.service.js';
import { hashPassword, randomToken, sha256, verifyAgainstDummy, verifyPassword } from '../../common/auth/crypto.js';
import { SessionService } from '../../common/auth/session.service.js';
import { TokensService } from '../../common/auth/tokens.service.js';
import { DomainError } from '../../common/errors.js';
import { MailerService } from '../../common/mailer.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { type RequestMeta } from '../../common/request-meta.js';
import { toUserDto } from './user.dto.js';

const RESET_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get policy() {
    return { ttlMs: this.env.REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000 };
  }

  private async issue(userId: string, meta: RequestMeta) {
    const session = await this.sessions.create('USER', userId, meta, this.policy);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { wallet: true } });
    return { accessToken: this.tokens.signUser(userId), refresh: session, user: toUserDto(user, user.wallet) };
  }

  /** F1.3 — Name, Email, Phone, Password (+ DOB 18+, terms). Wallet starts at 0 RON. */
  async register(input: z.output<typeof registerSchema>, meta: RequestMeta) {
    const [byEmail, byPhone] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true } }),
    ]);
    if (byEmail) throw new DomainError('EMAIL_TAKEN', { fields: { email: 'errors.EMAIL_TAKEN' } });
    if (byPhone) throw new DomainError('PHONE_TAKEN', { fields: { phone: 'errors.PHONE_TAKEN' } });

    const passwordHash = await hashPassword(input.password);
    let userId: string;
    try {
      userId = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            phone: input.phone,
            passwordHash,
            dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00Z`),
            termsAcceptedAt: new Date(),
            locale: input.locale ?? 'ro',
            wallet: { create: {} },
          },
        });
        await this.audit.log(
          {
            category: 'SYSTEM',
            action: 'USER_REGISTERED',
            actor: { type: 'USER', id: user.id, label: user.email, ...meta },
            entityType: 'User',
            entityId: user.id,
          },
          tx,
        );
        return user.id;
      });
    } catch (e) {
      // Concurrent registration with the same email/phone.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = String(e.meta?.['target'] ?? '');
        throw new DomainError(target.includes('phone') ? 'PHONE_TAKEN' : 'EMAIL_TAKEN');
      }
      throw e;
    }
    return this.issue(userId, meta);
  }

  /** F1.2 — email + password. Failed attempts are audited; the route is rate-limited. */
  async login(input: z.output<typeof loginSchema>, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const ok = user ? await verifyPassword(user.passwordHash, input.password) : await verifyAgainstDummy(input.password);
    if (!user || !ok) {
      await this.audit.log({
        category: 'SYSTEM',
        action: 'USER_LOGIN_FAILED',
        actor: { type: user ? 'USER' : 'SYSTEM', id: user?.id ?? null, label: input.email, ...meta },
        entityType: 'User',
        entityId: user?.id ?? null,
      });
      throw new DomainError('INVALID_CREDENTIALS');
    }
    if (user.status === 'SUSPENDED') {
      await this.audit.log({
        category: 'SYSTEM',
        action: 'USER_LOGIN_BLOCKED',
        actor: { type: 'USER', id: user.id, label: user.email, ...meta },
        entityType: 'User',
        entityId: user.id,
      });
      throw new DomainError('ACCOUNT_SUSPENDED');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({
      category: 'SYSTEM',
      action: 'USER_LOGIN',
      actor: { type: 'USER', id: user.id, label: user.email, ...meta },
      entityType: 'User',
      entityId: user.id,
    });
    return this.issue(user.id, meta);
  }

  async refresh(token: string | undefined) {
    const rotated = await this.sessions.rotate('USER', token, this.policy);
    const user = await this.prisma.user.findUnique({ where: { id: rotated.subjectId }, include: { wallet: true } });
    if (!user || user.status === 'SUSPENDED') {
      await this.sessions.revoke(rotated.token);
      throw new DomainError(user ? 'ACCOUNT_SUSPENDED' : 'UNAUTHORIZED');
    }
    return { accessToken: this.tokens.signUser(user.id), refresh: rotated, user: toUserDto(user, user.wallet) };
  }

  async logout(token: string | undefined) {
    await this.sessions.revoke(token);
  }

  /** Always succeeds so the endpoint cannot be used to discover accounts. */
  async forgotPassword(email: string, locale: string, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;
    const token = randomToken();
    await this.prisma.passwordReset.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    const lang = user.locale === 'en' || locale === 'en' ? 'en' : 'ro';
    const link = `${this.env.WEB_ORIGIN}/${lang}/reset-password?token=${token}`;
    await this.mailer.send({
      to: user.email,
      subject: lang === 'en' ? 'Reset your GoalBet password' : 'Resetează parola GoalBet',
      text: link,
    });
    await this.audit.log({
      category: 'SYSTEM',
      action: 'PASSWORD_RESET_REQUESTED',
      actor: { type: 'USER', id: user.id, label: user.email, ...meta },
      entityType: 'User',
      entityId: user.id,
    });
  }

  async resetPassword(input: z.output<typeof resetPasswordSchema>, meta: RequestMeta) {
    const reset = await this.prisma.passwordReset.findUnique({ where: { tokenHash: sha256(input.token) } });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) throw new DomainError('INVALID_TOKEN');
    const passwordHash = await hashPassword(input.password);
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await this.audit.log(
        {
          category: 'SYSTEM',
          action: 'PASSWORD_RESET',
          actor: { type: 'USER', id: reset.userId, ...meta },
          entityType: 'User',
          entityId: reset.userId,
        },
        tx,
      );
    });
    await this.sessions.revokeAll('USER', reset.userId);
  }
}
