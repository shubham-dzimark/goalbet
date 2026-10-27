import { Module } from '@nestjs/common';
import { OddsManagementModule } from '../odds-management/odds-management.module.js';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module.js';
import { BetValidationService } from './bet-validation.service.js';
import { BetService } from './bet.service.js';
import { BetsController } from './bets.controller.js';
import { TicketsService } from './tickets.service.js';

/** F4.2 BetProcessing — bet validation, rejection and ticket creation (F1.10–F1.15), My Bets (F1.7). */
@Module({
  imports: [WalletLedgerModule, OddsManagementModule],
  controllers: [BetsController],
  providers: [BetValidationService, BetService, TicketsService],
  exports: [BetValidationService, BetService, TicketsService],
})
export class BetProcessingModule {}
