import { Module } from '@nestjs/common';
import { ApiIntegrationModule } from '../api-integration/api-integration.module.js';
import { BoostService } from './boost.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { IngestService } from './ingest.service.js';

/** F4.2 OddsManagement — fixtures, markets, odds and live state in the DB; catalogue for the frontends. */
@Module({
  imports: [ApiIntegrationModule],
  controllers: [CatalogController],
  providers: [IngestService, CatalogService, BoostService],
  exports: [IngestService, CatalogService, BoostService],
})
export class OddsManagementModule {}
