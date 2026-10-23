import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { type Job, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { AuditService, BoostService, ENV, type Env, IngestService, SYSTEM_ACTOR } from '@goalbet/api/kit';

type Handler = (job: Job) => Promise<unknown>;

interface JobDef {
  /** Repeat interval; BullMQ guarantees one run per tick across all worker replicas. */
  every: number;
  handler: Handler;
}

/**
 * Worker process (apps/worker): BullMQ on Redis running the engine's background flows.
 * Every job has its own queue + worker so a slow job (e.g. a big fixtures sync) can never
 * delay live updates.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('Jobs');
  private readonly connection: Redis;
  private readonly queues: Queue[] = [];
  private readonly workers: Worker[] = [];
  private readonly lastFailureAudit = new Map<string, number>();

  constructor(
    private readonly ingest: IngestService,
    private readonly boosts: BoostService,
    private readonly audit: AuditService,
    @Inject(ENV) env: Env,
  ) {
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }

  readonly jobs: Record<string, JobDef> = {
    /** F4.1 odds ingest: competitions, fixtures for the next 7 days and their markets. */
    'fixtures-sync': {
      every: 5 * 60_000,
      handler: async () => {
        await this.ingest.syncCompetitions();
        const now = Date.now();
        const ids = await this.ingest.syncFixtures(new Date(now - 4 * 3600_000), new Date(now + 7 * 24 * 3600_000));
        for (const id of ids) await this.ingest.syncMarkets(id);
        const boosts = await this.boosts.ensureDemoBoosts();
        return { fixtures: ids.length, boosts };
      },
    },
    /** Pre-match odds drift for matches in the next 48 h. */
    'prematch-odds': { every: 60_000, handler: () => this.ingest.refreshPrematch(48 * 3600_000) },
    /** F1.6 / F2.2 live scores, in-play markets and live odds. */
    'live-sync': { every: 2_000, handler: async () => ({ transitions: (await this.ingest.syncLive()).length }) },
  };

  async onModuleInit() {
    for (const [name, def] of Object.entries(this.jobs)) {
      const queueName = `gb-${name}`;
      const queue = new Queue(queueName, { connection: this.connection });
      await queue.upsertJobScheduler(name, { every: def.every }, { name, opts: { removeOnComplete: 20, removeOnFail: 100 } });
      const worker = new Worker(queueName, (job) => def.handler(job), {
        connection: this.connection.duplicate(),
        concurrency: 1,
      });
      worker.on('failed', (job, err) => void this.onFailed(job?.name ?? name, err));
      this.queues.push(queue);
      this.workers.push(worker);
    }
    this.logger.log(`worker started: ${Object.keys(this.jobs).join(', ')}`);
  }

  /** System events (rule 6): job failures are audited, at most once a minute per job name. */
  private async onFailed(name: string, err: Error) {
    this.logger.warn(`job ${name} failed: ${err.message}`);
    const last = this.lastFailureAudit.get(name) ?? 0;
    if (Date.now() - last < 60_000) return;
    this.lastFailureAudit.set(name, Date.now());
    await this.audit
      .log({ category: 'SYSTEM', action: 'JOB_FAILED', actor: SYSTEM_ACTOR, entityType: 'Job', entityId: name, meta: { error: err.message } })
      .catch(() => undefined);
  }

  async onApplicationShutdown() {
    await Promise.allSettled(this.workers.map((w) => w.close()));
    await Promise.allSettled(this.queues.map((q) => q.close()));
    await this.connection.quit();
  }
}
