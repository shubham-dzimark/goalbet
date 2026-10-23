import { Module } from '@nestjs/common';
import { AccountController } from './account.controller.js';
import { AuthController, DevMailboxController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { ResponsibleGamingService } from './responsible-gaming.service.js';

/** F4.2 UserManagement — registration, login, sessions and the player account (F1.2–F1.4). */
@Module({
  controllers: [AuthController, AccountController, DevMailboxController],
  providers: [AuthService, ResponsibleGamingService],
  exports: [AuthService, ResponsibleGamingService],
})
export class UserManagementModule {}
