import { Module } from '@nestjs/common';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
import { CashOutController } from './cash-out.controller.js';
import { CashOutService } from './cash-out.service.js';

/** F4.2 CashOutEngine — live cash-out offers and accepting them (F2.3–F2.7). */
@Module({
  imports: [WalletLedgerModule],
  controllers: [CashOutController],
  providers: [CashOutService],
  exports: [CashOutService],
})
export class CashOutEngineModule {}
