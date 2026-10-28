import { Logger } from '@nestjs/common';
import { type Redis } from 'ioredis';

export class BudgetExceededError extends Error {
  constructor(kind: 'day' | 'minute') {
    super(`api-football ${kind} budget exhausted`);
  }
}

export interface ApiFootballClientOptions {
  apiKey: string;
  baseUrl: string;
  /** Calls we allow ourselves per UTC day (the free plan has 100). */
  dailyBudget: number;
  /** Calls per rolling minute (the free plan has 10). */
  perMinute: number;
}

const day = () => new Date().toISOString().slice(0, 10);

/**
 * HTTP client for API-Football v3 with a hard request budget shared by every API/worker process
 * through Redis, so the plan's daily/minute quota can never be exceeded.
 */
export class ApiFootballClient {
  private readonly logger = new Logger('ApiFootball');

  constructor(
    private readonly opts: ApiFootballClientOptions,
    private readonly redis: Redis,
  ) {}

  async used(): Promise<{ today: number; budget: number; providerRemaining: number | null }> {
    const [today, remaining] = await Promise.all([this.redis.get(`af:budget:${day()}`), this.redis.get('af:remaining')]);
    return { today: Number(today ?? 0), budget: this.opts.dailyBudget, providerRemaining: remaining === null ? null : Number(remaining) };
  }

  /** Calls left today under our own budget. */
  async remaining(): Promise<number> {
    const u = await this.used();
    const ours = u.budget - u.today;
    return u.providerRemaining === null ? ours : Math.min(ours, u.providerRemaining - 3);
  }

  /** Take one slot from the minute and day budgets; a refused attempt gives its slots back. */
  private async reserve() {
    const dayKey = `af:budget:${day()}`;
    const minuteKey = `af:minute:${Math.floor(Date.now() / 60_000)}`;
    const minuteCount = await this.redis.incr(minuteKey);
    await this.redis.expire(minuteKey, 120);
    if (minuteCount > this.opts.perMinute) {
      await this.redis.decr(minuteKey);
      throw new BudgetExceededError('minute');
    }
    const dayCount = await this.redis.incr(dayKey);
    await this.redis.expire(dayKey, 2 * 86_400);
    if (dayCount > this.opts.dailyBudget) {
      await this.redis.decr(dayKey);
      await this.redis.decr(minuteKey);
      throw new BudgetExceededError('day');
    }
  }

  async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T[]> {
    await this.reserve();
    const url = new URL(path.replace(/^\//, ''), this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await fetch(url, { headers: { 'x-apisports-key': this.opts.apiKey }, signal: AbortSignal.timeout(15_000) });
    const remaining = res.headers.get('x-ratelimit-requests-remaining');
    if (remaining !== null) await this.redis.set('af:remaining', remaining, 'EX', 86_400);
    if (!res.ok) throw new Error(`api-football ${path} HTTP ${res.status}`);
    const body = (await res.json()) as { response: T[]; errors: unknown };
    const errors = body.errors;
    if (errors && !Array.isArray(errors) && Object.keys(errors as object).length > 0) {
      // plan refusals (date range, unsupported parameter) are not charged by API-Football:
      // give the call back so our own daily budget matches theirs
      if ('plan' in (errors as object)) await this.redis.decr(`af:budget:${day()}`);
      throw new Error(`api-football ${path}: ${JSON.stringify(errors)}`);
    }
    this.logger.debug({ apiFootball: path, params, results: body.response.length });
    return body.response;
  }
}
