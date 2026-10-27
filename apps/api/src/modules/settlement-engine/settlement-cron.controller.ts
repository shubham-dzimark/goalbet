import { Controller, Get, Headers, Inject } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { assertCron } from '../../common/cron-auth.js';
import { ENV, type Env } from '../../config/env.js';
import { WalletService } from '../wallet-ledger/wallet.service.js';
import { SettlementService } from './settlement.service.js';

/** Serverless hosts have no worker: settlement and the money check run on a schedule instead. */
@ApiExcludeController()
@SkipThrottle()
@Controller('cron')
export class SettlementCronController {
  constructor(
    private readonly settlement: SettlementService,
    private readonly wallet: WalletService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('settle')
  async settle(@Headers('authorization') auth?: string) {
    assertCron(this.env, auth);
    const settled = await this.settlement.settlePending(50);
    const reconciliation = await this.wallet.reconcile();
    return { ...settled, reconciliation };
  }
}
