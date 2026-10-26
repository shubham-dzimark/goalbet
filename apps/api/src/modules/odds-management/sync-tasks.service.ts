import { Injectable } from '@nestjs/common';
import { BoostService } from './boost.service.js';
import { IngestService } from './ingest.service.js';

export type SyncTask = 'fixtures' | 'prematch' | 'live';

/**
 * The background data flows (F4.1 ingest), shared by the two ways of running them: the BullMQ
 * worker (apps/worker, always-on hosts) and refresh-on-visit (FreshnessService, serverless).
 */
@Injectable()
export class SyncTasksService {
  constructor(
    private readonly ingest: IngestService,
    private readonly boosts: BoostService,
  ) {}

  /** Competitions, fixtures for the next 7 days and their markets, plus demo boosts. */
  async fixtures() {
    await this.ingest.syncCompetitions();
    const now = Date.now();
    const ids = await this.ingest.syncFixtures(new Date(now - 4 * 3600_000), new Date(now + 7 * 24 * 3600_000));
    for (const id of ids) await this.ingest.syncMarkets(id);
    const boosts = await this.boosts.ensureDemoBoosts();
    return { fixtures: ids.length, boosts };
  }

  /** Pre-match odds drift for matches in the next 48 h. */
  prematch() {
    return this.ingest.refreshPrematch(48 * 3600_000);
  }

  /** F1.6 / F2.2 live scores, in-play markets and live odds. */
  async live() {
    return { transitions: (await this.ingest.syncLive()).length };
  }

  run(task: SyncTask) {
    return this[task]();
  }
}
