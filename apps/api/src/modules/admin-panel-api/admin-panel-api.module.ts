import { Module } from '@nestjs/common';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminBetsController } from './admin-bets.controller.js';
import { AdminReportsController } from './admin-reports.controller.js';
import { AdminReportsService } from './admin-reports.service.js';
import { AdminSportsbookController } from './admin-sportsbook.controller.js';
import { AdminSportsbookService } from './admin-sportsbook.service.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminWalletController } from './admin-wallet.controller.js';

/** F4.2 AdminPanelApi — everything behind the admin app (F3.1–F3.8). */
@Module({
  imports: [WalletLedgerModule],
  controllers: [AdminAuthController, AdminUsersController, AdminWalletController, AdminBetsController, AdminSportsbookController, AdminReportsController],
  providers: [AdminAuthService, AdminUsersService, AdminSportsbookService, AdminReportsService],
})
export class AdminPanelApiModule {}
