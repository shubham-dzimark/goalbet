import { Controller, Get, Headers, Inject } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { DomainError } from '../../common/errors.js';
import { ENV, type Env } from '../../config/env.js';
import { FreshnessService } from './freshness.service.js';

/**
 * Scheduled refresh for serverless hosts (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
 * Hidden unless JOBS_MODE=on-request and CRON_SECRET is set.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('cron')
export class CronController {
  constructor(
    private readonly freshness: FreshnessService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('refresh')
  async refresh(@Headers('authorization') auth?: string) {
    const secret = this.env.CRON_SECRET;
    if (!this.freshness.enabled || !secret) throw new DomainError('NOT_FOUND');
    const expected = Buffer.from(`Bearer ${secret}`);
    const given = Buffer.from(auth ?? '');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new DomainError('UNAUTHORIZED');
    return this.freshness.runAll();
  }
}
