import { Module } from '@nestjs/common';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminWalletController } from './admin-wallet.controller.js';

/** F4.2 AdminPanelApi — everything behind the admin app (F3.1–F3.8). */
@Module({
  imports: [WalletLedgerModule],
  controllers: [AdminAuthController, AdminWalletController],
  providers: [AdminAuthService],
})
export class AdminPanelApiModule {}
