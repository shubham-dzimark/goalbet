import { Module } from '@nestjs/common';
import { ApiIntegrationModule } from '../api-integration/api-integration.module.js';
import { IngestService } from './ingest.service.js';

/** F4.2 OddsManagement — fixtures, markets, odds and live state in the DB; catalogue for the frontends. */
@Module({
  imports: [ApiIntegrationModule],
  providers: [IngestService],
  exports: [IngestService],
})
export class OddsManagementModule {}
