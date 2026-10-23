import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { adminWalletAdjustSchema, walletQuerySchema } from '@goalbet/shared';
import { AdminAuthGuard, type AuthedAdmin, CurrentAdmin, Roles } from '../../common/auth/guards.js';
import { PrismaService } from '../../common/prisma.service.js';
import { ReqMeta, type RequestMeta } from '../../common/request-meta.js';
import { ZBody, ZQuery } from '../../common/zod.js';
import { AdminWalletService } from '../wallet-ledger/admin-wallet.service.js';
import { WalletService } from '../wallet-ledger/wallet.service.js';

const actorOf = (a: AuthedAdmin, meta: RequestMeta) => ({ type: 'ADMIN' as const, id: a.id, label: a.email, ...meta });

/** F3.3 wallet management (backend; the admin screens arrive in phase 3). */
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

  /** Find players by email, phone or name. */
  @Get('users')
  async users(@Query('q') q = '') {
    const term = q.trim();
    const contains = { contains: term, mode: 'insensitive' as const };
    const users = await this.prisma.user.findMany({
      where: term ? { OR: [{ email: contains }, { phone: contains }, { name: contains }] } : {},
      include: { wallet: { select: { balanceBani: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      status: u.status,
      balanceBani: u.wallet?.balanceBani ?? 0,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  @Post('users/:id/wallet')
  @Roles('FINANCE')
  @HttpCode(200)
  adjust(
    @CurrentAdmin() admin: AuthedAdmin,
    @Param('id', ParseUUIDPipe) userId: string,
    @ZBody(adminWalletAdjustSchema) body: z.output<typeof adminWalletAdjustSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.adminWallet.adjust(actorOf(admin, meta), userId, body);
  }

  @Get('users/:id/wallet/transactions')
  history(@Param('id', ParseUUIDPipe) userId: string, @ZQuery(walletQuerySchema) q: z.output<typeof walletQuerySchema>) {
    return this.wallet.history(userId, q);
  }

  @Get('approvals')
  @Roles('FINANCE')
  approvals() {
    return this.adminWallet.pending();
  }

  @Post('approvals/:id/approve')
  @Roles('FINANCE')
  @HttpCode(200)
  approve(@CurrentAdmin() admin: AuthedAdmin, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.adminWallet.approve(actorOf(admin, meta), id);
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
    return this.adminWallet.reject(actorOf(admin, meta), id, body.note);
  }
}
