import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ApiIntegrationModule } from '../api-integration/api-integration.module.js';
import { BoostService } from './boost.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { CronController } from './cron.controller.js';
import { FreshnessMiddleware, FreshnessService } from './freshness.service.js';
import { IngestService } from './ingest.service.js';
import { SyncTasksService } from './sync-tasks.service.js';

/** F4.2 OddsManagement — fixtures, markets, odds and live state in the DB; catalogue for the frontends. */
@Module({
  imports: [ApiIntegrationModule],
  controllers: [CatalogController, CronController],
  providers: [IngestService, CatalogService, BoostService, SyncTasksService, FreshnessService, FreshnessMiddleware],
  exports: [IngestService, CatalogService, BoostService, SyncTasksService],
})
export class OddsManagementModule implements NestModule {
  // on serverless hosts every catalogue visit may refresh stale data (no-op with a worker)
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(FreshnessMiddleware).forRoutes(CatalogController);
  }
}
