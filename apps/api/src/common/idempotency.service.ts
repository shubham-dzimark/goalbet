import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@goalbet/db';
import { DomainError } from './errors.js';
import { PrismaService } from './prisma.service.js';

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex');

/**
 * Idempotency-Key handling (rule 5). The first request with a key runs; a repeat with the same
 * key and body replays the stored response; a repeat with a different body, or while the first
 * is still running, is rejected. Failed requests release the key so the client may retry.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  static requireKey(key: string | undefined): string {
    if (!key || !/^[A-Za-z0-9_\-:.]{8,100}$/.test(key)) throw new DomainError('IDEMPOTENCY_KEY_REQUIRED', undefined, 400);
    return key;
  }

  async run<T>(
    scope: string,
    subjectId: string,
    key: string,
    body: unknown,
    fn: () => Promise<T>,
  ): Promise<{ result: T; replayed: boolean }> {
    const requestHash = hash(body);
    try {
      await this.prisma.idempotencyRecord.create({ data: { scope, subjectId, key, requestHash } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { scope_subjectId_key: { scope, subjectId, key } },
      });
      if (!existing || existing.requestHash !== requestHash || existing.status === null) {
        throw new DomainError('IDEMPOTENCY_CONFLICT');
      }
      return { result: existing.response as T, replayed: true };
    }

    try {
      const result = await fn();
      await this.prisma.idempotencyRecord.update({
        where: { scope_subjectId_key: { scope, subjectId, key } },
        data: { status: 200, response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue },
      });
      return { result, replayed: false };
    } catch (e) {
      await this.prisma.idempotencyRecord
        .delete({ where: { scope_subjectId_key: { scope, subjectId, key } } })
        .catch(() => undefined);
      throw e;
    }
  }
}
