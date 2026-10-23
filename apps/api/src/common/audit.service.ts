import { Injectable, Logger } from '@nestjs/common';
import { type AuditCategory, type Prisma, type Tx } from '@goalbet/db';
import { PrismaService } from './prisma.service.js';

export interface Actor {
  type: 'USER' | 'ADMIN' | 'SYSTEM';
  id?: string | null;
  label?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export const SYSTEM_ACTOR: Actor = { type: 'SYSTEM', label: 'system' };

export interface AuditEntry {
  category: AuditCategory;
  action: string;
  actor: Actor;
  entityType?: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: unknown;
}

const json = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

/**
 * F3.7 / F3.8 — single entry point for audit records. Pass the transaction client when the
 * audited change is transactional so the log and the change commit (or roll back) together.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx?: Tx) {
    const db = tx ?? this.prisma;
    const row = await db.auditLog.create({
      data: {
        category: entry.category,
        action: entry.action,
        actorType: entry.actor.type,
        actorId: entry.actor.id ?? null,
        actorLabel: entry.actor.label ?? null,
        ip: entry.actor.ip ?? null,
        userAgent: entry.actor.userAgent?.slice(0, 300) ?? null,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        before: json(entry.before),
        after: json(entry.after),
        meta: json(entry.meta),
      },
      select: { id: true },
    });
    this.logger.log({ audit: entry.action, category: entry.category, entity: entry.entityType, entityId: entry.entityId });
    return row.id;
  }
}
