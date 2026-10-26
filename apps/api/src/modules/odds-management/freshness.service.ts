import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { waitUntil } from '@vercel/functions';
import type { NextFunction, Request, Response } from 'express';
import { AuditService, SYSTEM_ACTOR } from '../../common/audit.service.js';
import { RedisService } from '../../common/redis.service.js';
import { ENV, type Env } from '../../config/env.js';
import { type SyncTask, SyncTasksService } from './sync-tasks.service.js';

/** How stale each kind of data may get before a visit refreshes it (on-request mode). */
const MAX_AGE_MS: Record<SyncTask, number> = {
  live: 15_000,
  prematch: 2 * 60_000,
  fixtures: 10 * 60_000,
};

/**
 * Refresh-on-visit for serverless hosts (JOBS_MODE=on-request), where no worker runs.
 * A catalogue request starts any task whose data is older than its max age. `SET NX PX` on one
 * Redis key is both the "fresh until" marker and the lock, so concurrent visitors and function
 * instances never run the same task twice. Tasks run after the response (`waitUntil`), so pages
 * never wait for the provider.
 */
@Injectable()
export class FreshnessService {
  private readonly logger = new Logger('Freshness');

  constructor(
    private readonly tasks: SyncTasksService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get enabled() {
    return this.env.JOBS_MODE === 'on-request';
  }

  /** Starts every due task in the background; returns at once. */
  kick() {
    if (!this.enabled) return;
    for (const task of Object.keys(MAX_AGE_MS) as SyncTask[]) waitUntil(this.runIfDue(task));
  }

  /** Runs every task now, ignoring freshness (daily cron safety net). */
  async runAll() {
    const results: Record<string, unknown> = {};
    for (const task of ['fixtures', 'prematch', 'live'] as SyncTask[]) {
      await this.redis.client.set(this.key(task), '1', 'PX', MAX_AGE_MS[task]);
      results[task] = await this.execute(task);
    }
    return results;
  }

  private key(task: SyncTask) {
    return `gb:fresh:${task}`;
  }

  private async runIfDue(task: SyncTask) {
    try {
      const claimed = await this.redis.client.set(this.key(task), '1', 'PX', MAX_AGE_MS[task], 'NX');
      if (claimed === 'OK') await this.execute(task);
    } catch (e) {
      this.logger.warn(`freshness check for ${task} failed: ${(e as Error).message}`);
    }
  }

  private async execute(task: SyncTask) {
    try {
      return await this.tasks.run(task);
    } catch (e) {
      const message = (e as Error).message;
      this.logger.warn(`sync ${task} failed: ${message}`);
      await this.audit
        .log({ category: 'SYSTEM', action: 'JOB_FAILED', actor: SYSTEM_ACTOR, entityType: 'Job', entityId: task, meta: { error: message } })
        .catch(() => undefined);
      return { error: message };
    }
  }
}

/** Applied to the public catalogue routes: each visit may start a background refresh. */
@Injectable()
export class FreshnessMiddleware implements NestMiddleware {
  constructor(private readonly freshness: FreshnessService) {}

  use(_req: Request, _res: Response, next: NextFunction) {
    this.freshness.kick();
    next();
  }
}
