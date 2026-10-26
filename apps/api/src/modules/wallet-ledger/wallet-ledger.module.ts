import { Module } from '@nestjs/common';
import { AdminWalletService } from './admin-wallet.service.js';
import { WalletController } from './wallet.controller.js';
import { PaymentsService } from './payments.service.js';
import { WalletService } from './wallet.service.js';

/** F4.2 WalletLedger — RON wallet, append-only ledger, admin credit/debit (F1.8, F3.3). */
@Module({
  controllers: [WalletController],
  providers: [WalletService, AdminWalletService, PaymentsService],
  exports: [WalletService, AdminWalletService, PaymentsService],
})
export class WalletLedgerModule {}
