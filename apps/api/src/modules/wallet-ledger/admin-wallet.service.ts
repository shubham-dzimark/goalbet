import { Injectable } from '@nestjs/common';
import { type Actor, AuditService } from '../../common/audit.service.js';
import { DomainError } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { SettingsService } from '../../common/settings.service.js';
import { WalletService } from './wallet.service.js';

export interface AdjustInput {
  type: 'ADMIN_CREDIT' | 'ADMIN_DEBIT';
  amountBani: number;
  reason: string;
}

/**
 * F3.3 — admin credit / debit with a mandatory reason. Amounts above
 * `wallet.approvalThresholdBani` wait for a second admin's approval.
 */
@Injectable()
export class AdminWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  private signed(type: AdjustInput['type'], amount: number) {
    return type === 'ADMIN_CREDIT' ? amount : -amount;
  }

  async adjust(actor: Actor & { id: string }, userId: string, input: AdjustInput) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) throw new DomainError('NOT_FOUND');
    if (!input.reason.trim()) throw new DomainError('REASON_REQUIRED');

    const threshold = await this.settings.get('wallet.approvalThresholdBani');
    if (input.amountBani > threshold) {
      const approval = await this.prisma.$transaction(async (tx) => {
        const a = await tx.creditApproval.create({
          data: { userId, type: input.type, amountBani: input.amountBani, reason: input.reason, requestedById: actor.id },
        });
        await this.audit.log(
          {
            category: 'ADMIN',
            action: 'CREDIT_APPROVAL_REQUESTED',
            actor,
            entityType: 'CreditApproval',
            entityId: a.id,
            after: { userId, type: input.type, amountBani: input.amountBani, reason: input.reason },
          },
          tx,
        );
        return a;
      });
      return { status: 'PENDING_APPROVAL' as const, approvalId: approval.id, thresholdBani: threshold };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const r = await this.wallet.apply(tx, {
        userId,
        type: input.type,
        amountBani: this.signed(input.type, input.amountBani),
        reason: input.reason,
        actor,
        adminId: actor.id,
      });
      await this.audit.log(
        {
          category: 'ADMIN',
          action: input.type === 'ADMIN_CREDIT' ? 'WALLET_CREDITED' : 'WALLET_DEBITED',
          actor,
          entityType: 'User',
          entityId: userId,
          after: { amountBani: input.amountBani, reason: input.reason, balanceBani: r.balanceBani },
        },
        tx,
      );
      return r;
    });
    await this.wallet.publishBalance(userId);
    return { status: 'APPLIED' as const, balanceBani: result.balanceBani, transactionId: result.transaction.id };
  }

  async approve(actor: Actor & { id: string }, approvalId: string) {
    const approval = await this.prisma.creditApproval.findUnique({ where: { id: approvalId } });
    if (!approval) throw new DomainError('NOT_FOUND');
    if (approval.status !== 'PENDING') throw new DomainError('VALIDATION_FAILED', { reason: 'already_decided' }, 409);
    if (approval.requestedById === actor.id) throw new DomainError('SELF_APPROVAL', undefined, 403);

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.creditApproval.updateMany({
        where: { id: approvalId, status: 'PENDING' },
        data: { status: 'APPROVED', decidedById: actor.id, decidedAt: new Date() },
      });
      if (claimed.count !== 1) throw new DomainError('VALIDATION_FAILED', { reason: 'already_decided' }, 409);
      const type = approval.type as AdjustInput['type'];
      const r = await this.wallet.apply(tx, {
        userId: approval.userId,
        type,
        amountBani: this.signed(type, approval.amountBani),
        reason: approval.reason,
        actor,
        adminId: approval.requestedById,
        approvalId: approval.id,
      });
      await this.audit.log(
        {
          category: 'ADMIN',
          action: 'CREDIT_APPROVAL_APPROVED',
          actor,
          entityType: 'CreditApproval',
          entityId: approval.id,
          before: { status: 'PENDING' },
          after: { status: 'APPROVED', balanceBani: r.balanceBani },
        },
        tx,
      );
      return r;
    });
    await this.wallet.publishBalance(approval.userId);
    return { status: 'APPROVED' as const, balanceBani: result.balanceBani };
  }

  async reject(actor: Actor & { id: string }, approvalId: string, note: string) {
    const approval = await this.prisma.creditApproval.findUnique({ where: { id: approvalId } });
    if (!approval) throw new DomainError('NOT_FOUND');
    if (approval.requestedById === actor.id) throw new DomainError('SELF_APPROVAL', undefined, 403);
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.creditApproval.updateMany({
        where: { id: approvalId, status: 'PENDING' },
        data: { status: 'REJECTED', decidedById: actor.id, decidedAt: new Date(), decisionNote: note },
      });
      if (r.count !== 1) throw new DomainError('VALIDATION_FAILED', { reason: 'already_decided' }, 409);
      await this.audit.log(
        { category: 'ADMIN', action: 'CREDIT_APPROVAL_REJECTED', actor, entityType: 'CreditApproval', entityId: approvalId, meta: { note } },
        tx,
      );
    });
    return { status: 'REJECTED' as const };
  }

  async pending() {
    return await this.prisma.creditApproval.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        requestedBy: { select: { id: true, email: true, name: true } },
      },
    });
  }
}
