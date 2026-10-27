import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type PaymentMethod, type PaymentRequest, type Prisma } from '@goalbet/db';
import {
  type AdminPaymentRequestRow,
  type PaymentInfoDto,
  type PaymentMessage,
  type PaymentRequestCreateInput,
  type PaymentRequestDto,
  normaliseIban,
} from '@goalbet/shared';
import { type Actor, AuditService } from '../../common/audit.service.js';
import { DomainError } from '../../common/errors.js';
import { DAY, strictestLimits } from '../../common/limits.js';
import { PrismaService } from '../../common/prisma.service.js';
import { Channels, RedisService } from '../../common/redis.service.js';
import { SettingsService } from '../../common/settings.service.js';
import { ENV, type Env } from '../../config/env.js';
import { WalletService } from './wallet.service.js';

const MAX_PENDING_DEPOSITS = 3;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I: read out at a shop counter

type Details = { payerReference?: string; iban?: string; accountHolder?: string };

/** "RO49AAAA1B31007593840000" → "RO49 •••• •••• 0000" for the player's own list. */
const maskIban = (iban: string) => `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}`;

/**
 * Deposit and withdrawal requests (admin-controlled wallet, F0.4 / F3.3): the player asks,
 * Finance confirms the money moved and approves (ledger DEPOSIT / WITHDRAWAL) or rejects.
 * A withdrawal holds its amount from the moment it is requested, so it can't be staked or
 * requested twice. Above `wallet.approvalThresholdBani` two different admins must approve.
 */

const DEPOSIT_WINDOWS: [string, number][] = [
  ['DAILY_DEPOSIT', DAY],
  ['WEEKLY_DEPOSIT', 7 * DAY],
  ['MONTHLY_DEPOSIT', 30 * DAY],
];

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private toDto(r: PaymentRequest, mask = true): PaymentRequestDto {
    const d = (r.details ?? {}) as Details;
    return {
      id: r.id,
      reference: r.reference,
      type: r.type,
      method: r.method,
      amountBani: r.amountBani,
      status: r.status,
      details: { ...d, ...(d.iban ? { iban: mask ? maskIban(d.iban) : d.iban } : {}) },
      note: r.note,
      awaitingSecondApproval: r.status === 'PENDING' && !!r.firstApprovedById,
      decisionNote: r.decisionNote,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private async newReference(type: 'DEPOSIT' | 'WITHDRAWAL') {
    for (let i = 0; i < 5; i++) {
      const code = `${type === 'DEPOSIT' ? 'D' : 'W'}-${Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('')}`;
      if (!(await this.prisma.paymentRequest.findUnique({ where: { reference: code }, select: { id: true } }))) return code;
    }
    throw new Error('could not allocate a payment reference');
  }

  private async methods(): Promise<PaymentMethod[]> {
    const s = await this.settings.all();
    return [...(s['payments.bankTransferEnabled'] ? (['BANK_TRANSFER'] as const) : []), ...(s['payments.cashAtShopEnabled'] ? (['CASH_AT_SHOP'] as const) : [])];
  }

  private async isExcluded(userId: string) {
    const now = new Date();
    return !!(await this.prisma.selfExclusion.findFirst({ where: { userId, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { id: true } }));
  }

  private async notify(r: PaymentRequest) {
    const msg: PaymentMessage = { type: 'payment', userId: r.userId, requestId: r.id, requestType: r.type, status: r.status, amountBani: r.amountBani };
    await this.redis.publish(Channels.PAYMENT_UPDATES, msg).catch(() => undefined);
    await this.wallet.publishBalance(r.userId);
  }

  // ── player ──
  async info(userId: string): Promise<PaymentInfoDto> {
    const [w, s, methods, pending, excluded] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId } }),
      this.settings.all(),
      this.methods(),
      this.prisma.paymentRequest.count({ where: { userId, type: 'WITHDRAWAL', status: 'PENDING' } }),
      this.isExcluded(userId),
    ]);
    if (!w) throw new DomainError('NOT_FOUND');
    return {
      balanceBani: w.balanceBani,
      heldBani: w.heldBani,
      availableBani: w.balanceBani - w.heldBani,
      methods,
      limits: {
        minDepositBani: s['wallet.minDepositBani'],
        maxDepositBani: s['wallet.maxDepositBani'],
        minWithdrawalBani: s['wallet.minWithdrawalBani'],
        maxWithdrawalBani: s['wallet.maxWithdrawalBani'],
      },
      bank: { beneficiary: this.env.PAYMENT_BANK_BENEFICIARY, iban: this.env.PAYMENT_BANK_IBAN, bankName: this.env.PAYMENT_BANK_NAME },
      pendingWithdrawal: pending > 0,
      depositBlocked: excluded,
    };
  }

  async list(userId: string, q: { cursor?: string | undefined; limit: number }) {
    const rows = await this.prisma.paymentRequest.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, q.limit).map((r) => this.toDto(r));
    return { items, nextCursor: rows.length > q.limit ? (items.at(-1)?.id ?? null) : null };
  }

  async create(userId: string, input: PaymentRequestCreateInput, actor: Actor): Promise<PaymentRequestDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!user || user.status !== 'ACTIVE') throw new DomainError('USER_NOT_ACTIVE', undefined, 403);
    if (!(await this.methods()).includes(input.method as PaymentMethod)) throw new DomainError('PAYMENT_METHOD_DISABLED');

    const s = await this.settings.all();
    const [min, max] =
      input.type === 'DEPOSIT' ? [s['wallet.minDepositBani'], s['wallet.maxDepositBani']] : [s['wallet.minWithdrawalBani'], s['wallet.maxWithdrawalBani']];
    if (input.amountBani < min || input.amountBani > max) throw new DomainError('PAYMENT_AMOUNT_LIMIT', { minBani: min, maxBani: max });

    let details: Details = {};
    if (input.type === 'DEPOSIT') {
      // self-excluded players may withdraw their money but not add more
      if (await this.isExcluded(userId)) throw new DomainError('SELF_EXCLUDED', undefined, 403);
      const pending = await this.prisma.paymentRequest.count({ where: { userId, type: 'DEPOSIT', status: 'PENDING' } });
      if (pending >= MAX_PENDING_DEPOSITS) throw new DomainError('TOO_MANY_PENDING', { max: MAX_PENDING_DEPOSITS });
      await this.checkDepositLimits(userId, input.amountBani);
      if (input.payerReference) details = { payerReference: input.payerReference };
    } else {
      if (await this.prisma.paymentRequest.count({ where: { userId, type: 'WITHDRAWAL', status: 'PENDING' } })) throw new DomainError('WITHDRAWAL_PENDING');
      if (input.method === 'BANK_TRANSFER') details = { iban: normaliseIban(input.iban ?? ''), accountHolder: input.accountHolder ?? '' };
    }

    const reference = await this.newReference(input.type);
    const created = await this.prisma.$transaction(async (tx) => {
      // the hold and the request commit together, under the wallet row lock
      if (input.type === 'WITHDRAWAL') await this.wallet.hold(tx, userId, input.amountBani);
      const row = await tx.paymentRequest.create({
        data: { reference, userId, type: input.type, method: input.method as PaymentMethod, amountBani: input.amountBani, details, note: input.note ?? null },
      });
      await this.audit.log(
        {
          category: 'WALLET',
          action: input.type === 'DEPOSIT' ? 'DEPOSIT_REQUESTED' : 'WITHDRAWAL_REQUESTED',
          actor,
          entityType: 'PaymentRequest',
          entityId: row.id,
          meta: { userId, amountBani: input.amountBani, method: input.method, reference },
        },
        tx,
      );
      return row;
    });
    await this.notify(created);
    return this.toDto(created);
  }

  /**
   * Responsible gambling: daily / weekly / monthly deposit limits (player or operator, strictest
   * wins). Requests waiting for Finance count too, so a player can't queue past the limit.
   */
  private async checkDepositLimits(userId: string, amountBani: number) {
    const strictest = strictestLimits(await this.prisma.userLimit.findMany({ where: { userId } }));
    for (const [type, span] of DEPOSIT_WINDOWS) {
      const limit = strictest.get(type);
      if (limit === undefined) continue;
      const agg = await this.prisma.paymentRequest.aggregate({
        where: { userId, type: 'DEPOSIT', status: { in: ['PENDING', 'APPROVED'] }, createdAt: { gte: new Date(Date.now() - span) } },
        _sum: { amountBani: true },
      });
      const used = agg._sum.amountBani ?? 0;
      if (used + amountBani > limit) throw new DomainError('DEPOSIT_LIMIT_EXCEEDED', { limit: type, maxBani: limit, usedBani: used });
    }
  }

  async cancel(userId: string, id: string, actor: Actor): Promise<PaymentRequestDto> {
    const r = await this.prisma.paymentRequest.findFirst({ where: { id, userId } });
    if (!r) throw new DomainError('NOT_FOUND');
    const updated = await this.close(r, 'CANCELLED', actor, { note: null, adminId: null });
    return this.toDto(updated);
  }

  /** PENDING → CANCELLED/REJECTED, giving a withdrawal's hold back. Guarded against races. */
  private async close(r: PaymentRequest, status: 'CANCELLED' | 'REJECTED', actor: Actor, by: { note: string | null; adminId: string | null }) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const n = await tx.paymentRequest.updateMany({
        where: { id: r.id, status: 'PENDING' },
        data: { status, decisionNote: by.note, decidedById: by.adminId, decidedAt: new Date() },
      });
      if (n.count === 0) throw new DomainError('REQUEST_NOT_PENDING');
      if (r.type === 'WITHDRAWAL') await this.wallet.releaseHold(tx, r.userId, r.amountBani);
      await this.audit.log(
        {
          category: 'WALLET',
          action: `${r.type}_${status}`,
          actor,
          entityType: 'PaymentRequest',
          entityId: r.id,
          meta: { userId: r.userId, amountBani: r.amountBani, reference: r.reference, note: by.note },
        },
        tx,
      );
      return tx.paymentRequest.findUniqueOrThrow({ where: { id: r.id } });
    });
    await this.notify(updated);
    return updated;
  }

  // ── Finance ──
  private async toAdminRow(r: Prisma.PaymentRequestGetPayload<{ include: typeof adminInclude }>): Promise<AdminPaymentRequestRow> {
    return {
      ...this.toDto(r, false),
      user: { id: r.user.id, name: r.user.name, email: r.user.email, balanceBani: r.user.wallet?.balanceBani ?? 0, heldBani: r.user.wallet?.heldBani ?? 0 },
      firstApprovedBy: r.firstApprovedBy,
      decidedBy: r.decidedBy,
    };
  }

  async adminList(q: { status?: string | undefined; type?: string | undefined; q?: string | undefined; cursor?: string | undefined; limit: number }) {
    const term = q.q?.trim();
    const rows = await this.prisma.paymentRequest.findMany({
      where: {
        ...(q.status ? { status: q.status as PaymentRequest['status'] } : {}),
        ...(q.type ? { type: q.type as PaymentRequest['type'] } : {}),
        ...(term ? { OR: [{ reference: term.toUpperCase() }, { user: { email: { contains: term, mode: 'insensitive' } } }] } : {}),
      },
      include: adminInclude,
      // waiting requests oldest first (a queue); history newest first
      orderBy: q.status === 'PENDING' ? [{ createdAt: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const items = await Promise.all(rows.slice(0, q.limit).map((r) => this.toAdminRow(r)));
    return { items, nextCursor: rows.length > q.limit ? (items.at(-1)?.id ?? null) : null };
  }

  async pendingCount() {
    return this.prisma.paymentRequest.count({ where: { status: 'PENDING' } });
  }

  /** Approve: deposits are credited, withdrawals debited from their hold; big amounts need two admins. */
  async approve(admin: Actor & { id: string }, id: string, note: string | undefined) {
    const r = await this.prisma.paymentRequest.findUnique({ where: { id } });
    if (!r) throw new DomainError('NOT_FOUND');
    if (r.status !== 'PENDING') throw new DomainError('REQUEST_NOT_PENDING');
    const threshold = await this.settings.get('wallet.approvalThresholdBani');

    if (r.amountBani > threshold && !r.firstApprovedById) {
      const n = await this.prisma.paymentRequest.updateMany({
        where: { id, status: 'PENDING', firstApprovedById: null },
        data: { firstApprovedById: admin.id, firstApprovedAt: new Date() },
      });
      if (n.count === 0) throw new DomainError('REQUEST_NOT_PENDING');
      await this.audit.log({ category: 'WALLET', action: `${r.type}_FIRST_APPROVAL`, actor: admin, entityType: 'PaymentRequest', entityId: id, meta: { amountBani: r.amountBani, note: note ?? null } });
      return this.adminGet(id);
    }
    if (r.firstApprovedById === admin.id) throw new DomainError('SELF_APPROVAL');

    const updated = await this.prisma.$transaction(async (tx) => {
      const n = await tx.paymentRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED', decidedById: admin.id, decidedAt: new Date(), decisionNote: note ?? null } });
      if (n.count === 0) throw new DomainError('REQUEST_NOT_PENDING');
      const deposit = r.type === 'DEPOSIT';
      const { transaction } = await this.wallet.apply(tx, {
        userId: r.userId,
        type: deposit ? 'DEPOSIT' : 'WITHDRAWAL',
        amountBani: deposit ? r.amountBani : -r.amountBani,
        reason: `${deposit ? 'Deposit' : 'Withdrawal'} ${r.reference}`,
        actor: admin,
        adminId: admin.id,
        uniqueRef: `PAY:${r.id}`,
        ...(deposit ? {} : { releaseHoldBani: r.amountBani }),
      });
      await tx.paymentRequest.update({ where: { id }, data: { transactionId: transaction.id } });
      await this.audit.log(
        { category: 'WALLET', action: `${r.type}_APPROVED`, actor: admin, entityType: 'PaymentRequest', entityId: id, meta: { userId: r.userId, amountBani: r.amountBani, reference: r.reference, note: note ?? null } },
        tx,
      );
      return tx.paymentRequest.findUniqueOrThrow({ where: { id } });
    });
    await this.notify(updated);
    return this.adminGet(id);
  }

  async reject(admin: Actor & { id: string }, id: string, note: string) {
    const r = await this.prisma.paymentRequest.findUnique({ where: { id } });
    if (!r) throw new DomainError('NOT_FOUND');
    await this.close(r, 'REJECTED', admin, { note, adminId: admin.id });
    return this.adminGet(id);
  }

  private async adminGet(id: string) {
    return this.toAdminRow(await this.prisma.paymentRequest.findUniqueOrThrow({ where: { id }, include: adminInclude }));
  }
}

const adminInclude = {
  user: { select: { id: true, name: true, email: true, wallet: { select: { balanceBani: true, heldBani: true } } } },
  firstApprovedBy: { select: { id: true, email: true } },
  decidedBy: { select: { id: true, email: true } },
} satisfies Prisma.PaymentRequestInclude;
