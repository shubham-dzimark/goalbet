import { Controller, Get, Headers, Inject } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { assertCron } from '../../common/cron-auth.js';
import { ENV, type Env } from '../../config/env.js';
import { FreshnessService } from './freshness.service.js';

/** Scheduled refresh for serverless hosts (see assertCron). */
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
    assertCron(this.env, auth);
    return this.freshness.runAll();
  }
}
