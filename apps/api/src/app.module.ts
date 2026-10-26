import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { loadEnv } from './config/env.js';
import { CoreModule } from './common/core.module.js';
import { ApiExceptionFilter } from './common/exception.filter.js';
import { RedisThrottlerStorage } from './common/throttler-redis.storage.js';
import { AdminPanelApiModule } from './modules/admin-panel-api/admin-panel-api.module.js';
import { ApiIntegrationModule } from './modules/api-integration/api-integration.module.js';
import { BetProcessingModule } from './modules/bet-processing/bet-processing.module.js';
import { CashOutEngineModule } from './modules/cash-out-engine/cash-out-engine.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { OddsManagementModule } from './modules/odds-management/odds-management.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { SettlementEngineModule } from './modules/settlement-engine/settlement-engine.module.js';
import { UserManagementModule } from './modules/user-management/user-management.module.js';
import { WalletLedgerModule } from './modules/wallet-ledger/wallet-ledger.module.js';

const env = loadEnv();

export const loggerModule = LoggerModule.forRoot({
  pinoHttp: {
    level: env.LOG_LEVEL,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    autoLogging: { ignore: (req) => req.url === '/health' },
    ...(env.LOG_PRETTY ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  },
});

/** The betting engine modules, named after the flow chart (F4.2). */
export const ENGINE_MODULES = [
  ApiIntegrationModule,
  OddsManagementModule,
  BetProcessingModule,
  CashOutEngineModule,
  SettlementEngineModule,
  WalletLedgerModule,
  UserManagementModule,
  AdminPanelApiModule,
];

@Module({
  imports: [
    loggerModule,
    CoreModule,
    ThrottlerModule.forRootAsync({
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 600 }],
        storage,
      }),
    }),
    ...ENGINE_MODULES,
    // serverless functions cannot hold WebSockets; the web app falls back to polling there
    ...(env.JOBS_MODE === 'on-request' ? [] : [RealtimeModule]),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
