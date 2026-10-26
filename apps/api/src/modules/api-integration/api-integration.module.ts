import { Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { RedisService } from '../../common/redis.service.js';
import { ApiFootballClient } from './api-football/api-football.client.js';
import { ApiFootballProvider } from './api-football/api-football.provider.js';
import { MockControlController } from './mock-control.controller.js';
import { MockProvider } from './mock/mock.provider.js';
import { ODDS_PROVIDER, type OddsProvider } from './odds-provider.js';

/** F4.2 ApiIntegration — the sports data / odds provider behind the OddsProvider interface (F4.1). */
@Module({
  controllers: [MockControlController],
  providers: [
    {
      provide: ODDS_PROVIDER,
      inject: [ENV, RedisService],
      useFactory: (env: Env, redis: RedisService): OddsProvider => {
        if (env.ODDS_PROVIDER === 'api-football') {
          if (!env.API_FOOTBALL_KEY) throw new Error('API_FOOTBALL_KEY is required for ODDS_PROVIDER=api-football');
          const client = new ApiFootballClient(
            {
              apiKey: env.API_FOOTBALL_KEY,
              baseUrl: env.API_FOOTBALL_BASE_URL,
              dailyBudget: env.API_FOOTBALL_DAILY_BUDGET,
              perMinute: env.API_FOOTBALL_PER_MINUTE,
            },
            redis.client,
          );
          return new ApiFootballProvider(client, redis.client, env.API_FOOTBALL_LEAGUES);
        }
        return new MockProvider(redis);
      },
    },
  ],
  exports: [ODDS_PROVIDER],
})
export class ApiIntegrationModule {}
