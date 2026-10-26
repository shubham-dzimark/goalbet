import { Injectable, Logger } from '@nestjs/common';
import { type Prisma, type Tx, type WalletTxType } from '@goalbet/db';
import { type WalletMessage, type WalletTransactionDto } from '@goalbet/shared';
import { type Actor, AuditService } from '../../common/audit.service.js';
import { DomainError } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { Channels, RedisService } from '../../common/redis.service.js';

export interface LedgerEntry {
  userId: string;
  type: WalletTxType;
  /** Signed bani: credits > 0, debits < 0. */
  amountBani: number;
  reason: string;
  actor: Actor;
  ticketId?: string | null;
  adminId?: string | null;
  approvalId?: string | null;
  /** Guards against double crediting (e.g. `WIN:<ticketId>`). */
  uniqueRef?: string | null;
  /** WITHDRAWAL only: the hold this payout consumes (released in the same update). */
  releaseHoldBani?: number;
}

/**
 * F4.2 WalletLedger — the only code allowed to change a balance (rule 2 / F0.4).
 * Must run inside the caller's transaction; locks the wallet row with SELECT … FOR UPDATE (rule 4).
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  /** Lock and read the wallet row for the rest of the transaction. */
  async lock(tx: Tx, userId: string) {
    const rows = await tx.$queryRaw<{ id: string; balanceBani: number; heldBani: number }[]>`
      SELECT id, "balanceBani", "heldBani" FROM "Wallet" WHERE "userId" = ${userId}::uuid FOR UPDATE`;
    const w = rows[0];
    if (!w) throw new DomainError('NOT_FOUND');
    return w;
  }

  async apply(tx: Tx, e: LedgerEntry) {
    if (!Number.isSafeInteger(e.amountBani) || e.amountBani === 0) throw new Error('ledger amount must be a non-zero integer');
    if (!e.reason.trim()) throw new DomainError('REASON_REQUIRED');
    const w = await this.lock(tx, e.userId);
    const balanceAfter = w.balanceBani + e.amountBani;
    // money held for a pending withdrawal can't be staked or debited; only that withdrawal consumes it
    const release = e.type === 'WITHDRAWAL' ? (e.releaseHoldBani ?? 0) : 0;
    const heldAfter = w.heldBani - release;
    if (heldAfter < 0) throw new Error('hold release larger than the held amount');
    if (balanceAfter < heldAfter) throw new DomainError(e.type === 'STAKE' ? 'INSUFFICIENT_BALANCE' : 'NEGATIVE_BALANCE');

    await tx.wallet.update({ where: { id: w.id }, data: { balanceBani: balanceAfter, heldBani: heldAfter, version: { increment: 1 } } });
    const row = await tx.walletTransaction.create({
      data: {
        walletId: w.id,
        type: e.type,
        amountBani: e.amountBani,
        balanceAfterBani: balanceAfter,
        reason: e.reason,
        ticketId: e.ticketId ?? null,
        adminId: e.adminId ?? null,
        approvalId: e.approvalId ?? null,
        uniqueRef: e.uniqueRef ?? null,
      },
    });
    await this.audit.log(
      {
        category: 'WALLET',
        action: `WALLET_${e.type}`,
        actor: e.actor,
        entityType: 'Wallet',
        entityId: w.id,
        before: { balanceBani: w.balanceBani },
        after: { balanceBani: balanceAfter },
        meta: { userId: e.userId, amountBani: e.amountBani, reason: e.reason, ticketId: e.ticketId ?? null, transactionId: row.id },
      },
      tx,
    );
    return { transaction: row, balanceBani: balanceAfter };
  }

  /** Reserve money for a pending withdrawal (no ledger entry: nothing has left the wallet yet). */
  async hold(tx: Tx, userId: string, bani: number) {
    const w = await this.lock(tx, userId);
    if (w.balanceBani - w.heldBani < bani) throw new DomainError('INSUFFICIENT_BALANCE', { availableBani: w.balanceBani - w.heldBani });
    await tx.wallet.update({ where: { id: w.id }, data: { heldBani: w.heldBani + bani, version: { increment: 1 } } });
    return { balanceBani: w.balanceBani, heldBani: w.heldBani + bani };
  }

  /** Give held money back (withdrawal rejected or cancelled). */
  async releaseHold(tx: Tx, userId: string, bani: number) {
    const w = await this.lock(tx, userId);
    await tx.wallet.update({ where: { id: w.id }, data: { heldBani: Math.max(0, w.heldBani - bani), version: { increment: 1 } } });
  }

  /** Push the new balance to the player's sockets (call after commit). */
  async publishBalance(userId: string) {
    const w = await this.prisma.wallet.findUnique({ where: { userId }, select: { balanceBani: true, heldBani: true } });
    if (!w) return;
    const msg: WalletMessage = { type: 'wallet', userId, balanceBani: w.balanceBani, heldBani: w.heldBani };
    await this.redis.publish(Channels.WALLET_UPDATES, msg).catch(() => undefined);
  }

  async balance(userId: string) {
    const w = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!w) throw new DomainError('NOT_FOUND');
    return { balanceBani: w.balanceBani, heldBani: w.heldBani, availableBani: w.balanceBani - w.heldBani, currency: w.currency };
  }

  /** F1.8 — transaction history with type/date filters, newest first. */
  async history(
    userId: string,
    q: { type?: string | undefined; from?: string | undefined; to?: string | undefined; cursor?: string | undefined; limit: number },
  ) {
    const where: Prisma.WalletTransactionWhereInput = {
      wallet: { userId },
      ...(q.type ? { type: q.type as WalletTxType } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}),
              ...(q.to ? { lt: new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000) } : {}),
            },
          }
        : {}),
    };
    const rows = await this.prisma.walletTransaction.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { ticket: { select: { code: true } } },
    });
    const items: WalletTransactionDto[] = rows.slice(0, q.limit).map((t) => ({
      id: t.id,
      type: t.type,
      amountBani: t.amountBani,
      balanceAfterBani: t.balanceAfterBani,
      reason: t.reason,
      ticketId: t.ticketId,
      ticketCode: t.ticket?.code ?? null,
      createdAt: t.createdAt.toISOString(),
    }));
    return { items, nextCursor: rows.length > q.limit ? (items[items.length - 1]?.id ?? null) : null };
  }

  /**
   * Ledger reconciliation (rule 2): every wallet balance must equal the sum of its transactions,
   * and the last transaction's balanceAfter must equal the balance. Mismatches are logged + audited.
   */
  async reconcile() {
    const mismatches = await this.prisma.$queryRaw<{ walletId: string; balanceBani: number; ledgerBani: bigint; lastAfter: number | null }[]>`
      SELECT w.id AS "walletId", w."balanceBani",
             COALESCE(SUM(t."amountBani"), 0) AS "ledgerBani",
             (SELECT t2."balanceAfterBani" FROM "WalletTransaction" t2 WHERE t2."walletId" = w.id
               ORDER BY t2."createdAt" DESC, t2.id DESC LIMIT 1) AS "lastAfter"
      FROM "Wallet" w LEFT JOIN "WalletTransaction" t ON t."walletId" = w.id
      GROUP BY w.id
      HAVING w."balanceBani" <> COALESCE(SUM(t."amountBani"), 0)`;
    const wallets = await this.prisma.wallet.count();
    for (const m of mismatches) {
      this.logger.error({ reconciliation: 'MISMATCH', ...m, ledgerBani: Number(m.ledgerBani) });
      await this.audit.log({
        category: 'SYSTEM',
        action: 'LEDGER_MISMATCH',
        actor: { type: 'SYSTEM', label: 'reconciliation' },
        entityType: 'Wallet',
        entityId: m.walletId,
        meta: { balanceBani: m.balanceBani, ledgerBani: Number(m.ledgerBani), lastBalanceAfter: m.lastAfter },
      });
    }
    await this.audit.log({
      category: 'SYSTEM',
      action: 'LEDGER_RECONCILED',
      actor: { type: 'SYSTEM', label: 'reconciliation' },
      meta: { wallets, mismatches: mismatches.length },
    });
    return { wallets, mismatches: mismatches.length };
  }
}
