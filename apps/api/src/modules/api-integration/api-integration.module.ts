import { Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { RedisService } from '../../common/redis.service.js';
import { MockControlController } from './mock-control.controller.js';
import { ODDS_PROVIDER } from './odds-provider.js';
import { ProviderConfigService } from './provider-config.service.js';
import { ProviderRouter } from './provider-router.js';

/**
 * F4.2 ApiIntegration — the sports data / odds provider behind the OddsProvider interface (F4.1).
 * Which provider (and API key) is chosen in Admin → Data provider; env vars are the fallback.
 */
@Module({
  controllers: [MockControlController],
  providers: [
    ProviderConfigService,
    {
      provide: ODDS_PROVIDER,
      inject: [ProviderConfigService, RedisService, ENV],
      useFactory: (config: ProviderConfigService, redis: RedisService, env: Env) => new ProviderRouter(config, redis, env.API_FOOTBALL_BASE_URL),
    },
  ],
  exports: [ODDS_PROVIDER, ProviderConfigService],
})
export class ApiIntegrationModule {}
