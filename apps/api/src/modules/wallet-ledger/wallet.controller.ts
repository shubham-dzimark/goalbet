import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { walletQuerySchema } from '@goalbet/shared';
import { type AuthedUser, CurrentUser, UserAuthGuard } from '../../common/auth/guards.js';
import { ZQuery } from '../../common/zod.js';
import { WalletService } from './wallet.service.js';

/** F1.8 — player wallet: RON balance + transaction history. No deposit/withdraw endpoints exist (F0.4). */
@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  balance(@CurrentUser() u: AuthedUser) {
    return this.wallet.balance(u.id);
  }

  @Get('transactions')
  history(@CurrentUser() u: AuthedUser, @ZQuery(walletQuerySchema) q: z.output<typeof walletQuerySchema>) {
    return this.wallet.history(u.id, q);
  }
}
