import { Module } from '@nestjs/common';
import { ApiIntegrationModule } from '../api-integration/api-integration.module.js';
import { OddsManagementModule } from '../odds-management/odds-management.module.js';
import { SettlementEngineModule } from '../settlement-engine/settlement-engine.module.js';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
import { AdminAccountController, AdminAdminsController } from './admin-accounts.controller.js';
import { AdminAccountsService } from './admin-accounts.service.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminBetsController } from './admin-bets.controller.js';
import { AdminDataProviderController } from './admin-data-provider.controller.js';
import { AdminPaymentsController } from './admin-payments.controller.js';
import { AdminReportsController } from './admin-reports.controller.js';
import { AdminReportsService } from './admin-reports.service.js';
import { AdminSportsbookController } from './admin-sportsbook.controller.js';
import { AdminSportsbookService } from './admin-sportsbook.service.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminWalletController } from './admin-wallet.controller.js';

/** F4.2 AdminPanelApi — everything behind the admin app (F3.1–F3.8). */
@Module({
  imports: [WalletLedgerModule, ApiIntegrationModule, OddsManagementModule, SettlementEngineModule],
  controllers: [AdminAuthController, AdminAccountController, AdminAdminsController, AdminUsersController, AdminWalletController, AdminPaymentsController, AdminBetsController, AdminSportsbookController, AdminReportsController, AdminDataProviderController],
  providers: [AdminAuthService, AdminAccountsService, AdminUsersService, AdminSportsbookService, AdminReportsService],
})
export class AdminPanelApiModule {}
