import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type WalletTxType } from '@goalbet/db';
import { type AdminApprovalRow, type AdminTransactionRow, adminTransactionQuerySchema, adminWalletAdjustSchema, walletQuerySchema } from '@goalbet/shared';
import { AdminAuthGuard, type AuthedAdmin, CurrentAdmin, Roles } from '../../common/auth/guards.js';
import { PrismaService } from '../../common/prisma.service.js';
import { ReqMeta, type RequestMeta } from '../../common/request-meta.js';
import { ZBody, ZQuery } from '../../common/zod.js';
import { AdminWalletService } from '../wallet-ledger/admin-wallet.service.js';
import { WalletService } from '../wallet-ledger/wallet.service.js';
import { actorOf } from './admin-actor.js';

const day = (d: string) => new Date(`${d}T00:00:00Z`);

/** F3.3 wallet management: add/remove RON credit with a reason, approvals, wallet history. */
@ApiTags('admin-wallet')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminWalletController {
  constructor(
    private readonly adminWallet: AdminWalletService,
    private readonly wallet: WalletService,
    private readonly prisma: PrismaService,
  ) {}

  /** Add (ADMIN_CREDIT) or remove (ADMIN_DEBIT) RON; above the threshold it waits for a second admin. */
  @Post('users/:id/wallet')
  @Roles('FINANCE')
  @HttpCode(200)
  adjust(
    @CurrentAdmin() admin: AuthedAdmin,
    @Param('id', ParseUUIDPipe) userId: string,
    @ZBody(adminWalletAdjustSchema) body: z.output<typeof adminWalletAdjustSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.adminWallet.adjust({ ...actorOf(admin, meta), id: admin.id }, userId, body);
  }

  @Get('users/:id/wallet/transactions')
  history(@Param('id', ParseUUIDPipe) userId: string, @ZQuery(walletQuerySchema) q: z.output<typeof walletQuerySchema>) {
    return this.wallet.history(userId, q);
  }

  /** Transaction log across every wallet (also the Reports "transaction logs"). */
  @Get('wallet/transactions')
  async transactions(@ZQuery(adminTransactionQuerySchema) q: z.output<typeof adminTransactionQuerySchema>) {
    const rows = await this.prisma.walletTransaction.findMany({
      where: {
        ...(q.type ? { type: q.type as WalletTxType } : {}),
        ...(q.userId ? { wallet: { userId: q.userId } } : {}),
        ...(q.from || q.to
          ? { createdAt: { ...(q.from ? { gte: day(q.from) } : {}), ...(q.to ? { lt: new Date(day(q.to).getTime() + 86_400_000) } : {}) } }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        wallet: { select: { user: { select: { id: true, name: true, email: true } } } },
        ticket: { select: { code: true } },
        admin: { select: { id: true, email: true } },
      },
    });
    const items: AdminTransactionRow[] = rows.slice(0, q.limit).map((t) => ({
      id: t.id,
      type: t.type,
      amountBani: t.amountBani,
      balanceAfterBani: t.balanceAfterBani,
      reason: t.reason,
      createdAt: t.createdAt.toISOString(),
      user: t.wallet.user,
      ticketCode: t.ticket?.code ?? null,
      admin: t.admin,
    }));
    return { items, nextCursor: rows.length > q.limit ? (items.at(-1)?.id ?? null) : null };
  }

  @Get('approvals')
  @Roles('FINANCE')
  async approvals(): Promise<AdminApprovalRow[]> {
    const rows = await this.adminWallet.pending();
    return rows.map((a) => ({
      id: a.id,
      type: a.type,
      amountBani: a.amountBani,
      reason: a.reason,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      user: a.user,
      requestedBy: { id: a.requestedBy.id, email: a.requestedBy.email },
    }));
  }

  @Post('approvals/:id/approve')
  @Roles('FINANCE')
  @HttpCode(200)
  approve(@CurrentAdmin() admin: AuthedAdmin, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.adminWallet.approve({ ...actorOf(admin, meta), id: admin.id }, id);
  }

  @Post('approvals/:id/reject')
  @Roles('FINANCE')
  @HttpCode(200)
  reject(
    @CurrentAdmin() admin: AuthedAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @ZBody(z.object({ note: z.string().trim().min(3, { message: 'validation.reason' }).max(300) })) body: { note: string },
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.adminWallet.reject({ ...actorOf(admin, meta), id: admin.id }, id, body.note);
  }
}
