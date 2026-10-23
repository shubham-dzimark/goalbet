import { Injectable } from '@nestjs/common';
import { type ActorType } from '@goalbet/db';
import { DomainError } from '../errors.js';
import { PrismaService } from '../prisma.service.js';
import { type RequestMeta } from '../request-meta.js';
import { randomToken, sha256 } from './crypto.js';

const REUSE_GRACE_MS = 10_000;

export interface SessionPolicy {
  /** Absolute lifetime. */
  ttlMs: number;
  /** Reject refresh when unused for this long (admin session timeout). */
  idleMs?: number;
}

/**
 * Refresh-token sessions (httpOnly cookie). Tokens are stored hashed and rotated on every refresh;
 * presenting a replaced token after a short grace period revokes every session of that subject.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(subjectType: ActorType, subjectId: string, meta: RequestMeta, policy: SessionPolicy) {
    const token = randomToken();
    const session = await this.prisma.authSession.create({
      data: {
        subjectType,
        subjectId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + policy.ttlMs),
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    });
    return { token, sessionId: session.id, expiresAt: session.expiresAt };
  }

  async rotate(subjectType: ActorType, token: string | undefined, policy: SessionPolicy) {
    if (!token) throw new DomainError('UNAUTHORIZED');
    const hash = sha256(token);
    const session = await this.prisma.authSession.findUnique({ where: { tokenHash: hash } });
    if (!session) {
      const rotated = await this.prisma.authSession.findUnique({ where: { prevTokenHash: hash } });
      if (rotated && rotated.subjectType === subjectType) {
        // A replaced token came back. Within a few seconds it is most likely a parallel refresh
        // from a second tab; after that, assume theft and end every session of this subject.
        if (Date.now() - rotated.lastUsedAt.getTime() > REUSE_GRACE_MS) {
          await this.revokeAll(subjectType, rotated.subjectId);
          throw new DomainError('SESSION_EXPIRED');
        }
      }
      throw new DomainError('UNAUTHORIZED');
    }
    if (session.subjectType !== subjectType) throw new DomainError('UNAUTHORIZED');
    if (session.revokedAt) throw new DomainError('SESSION_EXPIRED');
    const now = Date.now();
    const idleExpired = policy.idleMs !== undefined && now - session.lastUsedAt.getTime() > policy.idleMs;
    if (session.expiresAt.getTime() < now || idleExpired) {
      await this.prisma.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      throw new DomainError('SESSION_EXPIRED');
    }
    const next = randomToken();
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { tokenHash: sha256(next), prevTokenHash: hash, lastUsedAt: new Date() },
    });
    return { token: next, sessionId: session.id, subjectId: session.subjectId, expiresAt: session.expiresAt };
  }

  /** Admin requests keep the session alive; returns false when idle-expired or revoked. */
  async touch(sessionId: string, idleMs: number): Promise<boolean> {
    const s = await this.prisma.authSession.findUnique({ where: { id: sessionId } });
    if (!s || s.revokedAt || s.expiresAt.getTime() < Date.now()) return false;
    if (Date.now() - s.lastUsedAt.getTime() > idleMs) {
      await this.prisma.authSession.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
      return false;
    }
    if (Date.now() - s.lastUsedAt.getTime() > 30_000) {
      await this.prisma.authSession.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } });
    }
    return true;
  }

  async revoke(token: string | undefined) {
    if (!token) return;
    await this.prisma.authSession.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAll(subjectType: ActorType, subjectId: string) {
    await this.prisma.authSession.updateMany({
      where: { subjectType, subjectId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
