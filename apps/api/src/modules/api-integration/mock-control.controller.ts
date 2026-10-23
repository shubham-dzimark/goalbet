import { Controller, Delete, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env.js';
import { DomainError } from '../../common/errors.js';
import { ZBody } from '../../common/zod.js';
import { MockProvider } from './mock/mock.provider.js';
import { ODDS_PROVIDER, type OddsProvider } from './odds-provider.js';

const scoreSchema = z.object({ home: z.number().int().min(0).max(20), away: z.number().int().min(0).max(20) });
const oddsSchema = z.object({ factorBps: z.number().int().min(1000).max(50_000) });
const stallSchema = z.object({ seconds: z.number().int().min(1).max(600) });
const flagSchema = z.object({ value: z.boolean() });

/**
 * Dev/test-only control of the mock feed, used by the E2E suite and demos. Returns 404 unless
 * MOCK_CONTROL_ENABLED=true (refused in production by env validation).
 */
@ApiTags('dev')
@Controller('dev/mock')
export class MockControlController {
  constructor(
    @Inject(ODDS_PROVIDER) private readonly provider: OddsProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private mock(): MockProvider {
    if (!this.env.MOCK_CONTROL_ENABLED || !(this.provider instanceof MockProvider)) throw new DomainError('NOT_FOUND');
    return this.provider;
  }

  /** Move kickoff to now (+ optional offset). */
  @Post('events/:ref/kickoff')
  @HttpCode(200)
  kickoff(@Param('ref') ref: string) {
    return this.mock().setOverride(ref, { kickoffAt: Date.now() });
  }

  @Post('events/:ref/kickoff-in')
  @HttpCode(200)
  kickoffIn(@Param('ref') ref: string, @ZBody(stallSchema) body: { seconds: number }) {
    return this.mock().setOverride(ref, { kickoffAt: Date.now() + body.seconds * 1000 });
  }

  /** End the match now (provider then reports FINISHED + result). */
  @Post('events/:ref/finish')
  @HttpCode(200)
  async finish(@Param('ref') ref: string) {
    return this.mock().setOverride(ref, { finishAt: Date.now() });
  }

  @Post('events/:ref/score')
  @HttpCode(200)
  score(@Param('ref') ref: string, @ZBody(scoreSchema) body: { home: number; away: number }) {
    return this.mock().setOverride(ref, { finalScore: body });
  }

  /** Multiply every price of the event (10000 = unchanged). */
  @Post('events/:ref/odds')
  @HttpCode(200)
  odds(@Param('ref') ref: string, @ZBody(oddsSchema) body: { factorBps: number }) {
    return this.mock().setOverride(ref, { oddsFactorBps: body.factorBps });
  }

  @Post('events/:ref/suspend')
  @HttpCode(200)
  suspend(@Param('ref') ref: string, @ZBody(flagSchema) body: { value: boolean }) {
    return this.mock().setOverride(ref, { suspended: body.value });
  }

  @Post('events/:ref/cancel')
  @HttpCode(200)
  cancel(@Param('ref') ref: string) {
    return this.mock().setOverride(ref, { cancelled: true });
  }

  @Delete('events/:ref')
  @HttpCode(204)
  async reset(@Param('ref') ref: string) {
    await this.mock().clearOverride(ref);
  }

  /** Simulate a feed outage (F4.1: live markets auto-suspend after 30 s). */
  @Post('feed/stall')
  @HttpCode(200)
  async stall(@ZBody(stallSchema) body: { seconds: number }) {
    await this.mock().stallFeed(body.seconds * 1000);
    return { stalledFor: body.seconds };
  }

  @Post('feed/resume')
  @HttpCode(200)
  async resume() {
    await this.mock().resumeFeed();
    return { ok: true };
  }
}
