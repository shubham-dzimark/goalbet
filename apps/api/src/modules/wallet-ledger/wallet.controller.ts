import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { type PaymentRequestCreateInput, paymentRequestCreateSchema, paymentRequestQuerySchema, walletQuerySchema } from '@goalbet/shared';
import { type AuthedUser, CurrentUser, UserAuthGuard } from '../../common/auth/guards.js';
import { ReqMeta, type RequestMeta } from '../../common/request-meta.js';
import { ZBody, ZQuery } from '../../common/zod.js';
import { PaymentsService } from './payments.service.js';
import { WalletService } from './wallet.service.js';

/**
 * F1.8 — player wallet: RON balance, history, and deposit / withdrawal *requests*. The wallet stays
 * admin-controlled (F0.4): a request moves no money until Finance approves it.
 */
@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly payments: PaymentsService,
  ) {}

  @Get()
  balance(@CurrentUser() u: AuthedUser) {
    return this.wallet.balance(u.id);
  }

  @Get('transactions')
  history(@CurrentUser() u: AuthedUser, @ZQuery(walletQuerySchema) q: z.output<typeof walletQuerySchema>) {
    return this.wallet.history(u.id, q);
  }

  /** Methods, limits, bank details and available balance for the deposit / withdrawal forms. */
  @Get('payment-info')
  paymentInfo(@CurrentUser() u: AuthedUser) {
    return this.payments.info(u.id);
  }

  @Get('requests')
  requests(@CurrentUser() u: AuthedUser, @ZQuery(paymentRequestQuerySchema) q: z.output<typeof paymentRequestQuerySchema>) {
    return this.payments.list(u.id, q);
  }

  @Post('requests')
  request(@CurrentUser() u: AuthedUser, @ZBody(paymentRequestCreateSchema) body: PaymentRequestCreateInput, @ReqMeta() meta: RequestMeta) {
    return this.payments.create(u.id, body, { type: 'USER', id: u.id, ...meta });
  }

  @Post('requests/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthedUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.payments.cancel(u.id, id, { type: 'USER', id: u.id, ...meta });
  }
}
