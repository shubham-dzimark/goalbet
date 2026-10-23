import { Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';

/** F4.2 AdminPanelApi — everything behind the admin app (F3.1–F3.8). */
@Module({
  controllers: [AdminAuthController],
  providers: [AdminAuthService],
})
export class AdminPanelApiModule {}
