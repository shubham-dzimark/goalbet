import { Module } from '@nestjs/common';
import { ApiIntegrationModule } from '../api-integration/api-integration.module.js';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
import { SettlementCronController } from './settlement-cron.controller.js';
import { SettlementService } from './settlement.service.js';

/** F4.2 SettlementEngine — results, win/lose/void, payout and wallet credit (F2.8–F2.11). */
@Module({
  imports: [ApiIntegrationModule, WalletLedgerModule],
  controllers: [SettlementCronController],
  providers: [SettlementService],
  exports: [SettlementService],
})
export class SettlementEngineModule {}
