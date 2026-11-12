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
  /** Calls per UTC day used while the plan can't be read (the free plan has 100). */
  dailyBudget: number;
  /** Calls per minute used while the plan can't be read (the free plan has 10). */
  perMinute: number;
  /** Share (%) of the plan's limits to use once the plan is known (admin setting; default 95). */
  planShare?: () => Promise<number>;
}

/** The subscription as API-Football reports it; the budgets follow it automatically. */
export interface PlanLimits {
  plan: string;
  /** requests per day the plan allows */
  limitDay: number;
  /** requests per minute the plan allows */
  perMinute: number;
  /** a paid plan: any date, frequent refreshes */
  paid: boolean;
}

const day = () => new Date().toISOString().slice(0, 10);

/** The plan last detected (by any process), without asking API-Football. */
export async function storedPlan(redis: Redis): Promise<PlanLimits | null> {
  const raw = await redis.get('af:plan');
  const v = raw ? (JSON.parse(raw) as PlanLimits | { unknown: true }) : null;
  return v && !('unknown' in v) ? v : null;
}

/**
 * The budgets in force: `sharePct` % of the plan's limits once the plan is known (so an upgrade
 * raises them by itself), else the fixed fallback numbers.
 */
export function planBudgets(plan: PlanLimits | null, fallback: { dailyBudget: number; perMinute: number }, sharePct = DEFAULT_PLAN_SHARE_PCT) {
  if (!plan) return { daily: fallback.dailyBudget, perMinute: fallback.perMinute };
  const pct = Math.min(100, Math.max(1, sharePct));
  return {
    daily: Math.max(1, Math.floor((plan.limitDay * pct) / 100)),
    perMinute: Math.max(1, Math.floor((plan.perMinute * Math.min(pct, MAX_MINUTE_SHARE_PCT)) / 100)),
  };
}

/** Redis: the detected plan, JSON PlanLimits | { unknown: true } */
const PLAN_KEY = 'af:plan';
const PLAN_REFRESH_SEC = 3600;
/** API-Football's per-minute limits by plan, for when the header hasn't been seen yet */
const PLAN_PER_MINUTE: Record<string, number> = { free: 10, pro: 300, ultra: 450, mega: 900 };
/** default share of the plan: a margin for retries, manual checks and clock skew */
export const DEFAULT_PLAN_SHARE_PCT = 95;
/** the per-minute limit is never used beyond this share (bursts from several processes) */
const MAX_MINUTE_SHARE_PCT = 90;

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

  /**
   * The current plan, read from /status (which API-Football does not count against the quota)
   * at most once an hour, and at once when a response shows a different daily limit.
   * Null while it can't be read: the configured budgets apply.
   */
  async limits(): Promise<PlanLimits | null> {
    const raw = await this.redis.get(PLAN_KEY);
    if (raw) {
      const v = JSON.parse(raw) as PlanLimits | { unknown: true };
      return 'unknown' in v ? null : v;
    }
    // one process asks; the others use the configured budgets meanwhile
    if (!(await this.redis.set(`${PLAN_KEY}:lock`, '1', 'EX', 30, 'NX'))) return null;
    try {
      return await this.detectPlan();
    } finally {
      await this.redis.del(`${PLAN_KEY}:lock`);
    }
  }

  private async detectPlan(): Promise<PlanLimits | null> {
    let found: PlanLimits | null = null;
    try {
      const res = await fetch(this.url('/status'), { headers: { 'x-apisports-key': this.opts.apiKey }, signal: AbortSignal.timeout(10_000) });
      const body = (await res.json()) as { response?: { subscription?: { plan?: string }; requests?: { limit_day?: number } } | unknown[] };
      const r = body.response && !Array.isArray(body.response) ? body.response : null;
      const limitDay = Number(r?.requests?.limit_day);
      if (res.ok && r && Number.isFinite(limitDay) && limitDay > 0) {
        const plan = r.subscription?.plan ?? 'unknown';
        const minuteHeader = Number(res.headers.get('x-ratelimit-limit'));
        const perMinute = minuteHeader > 0 ? minuteHeader : (PLAN_PER_MINUTE[plan.toLowerCase()] ?? (limitDay > 100 ? 300 : 10));
        found = { plan, limitDay, perMinute, paid: limitDay > 100 };
      }
    } catch (e) {
      this.logger.warn(`api-football plan check failed: ${(e as Error).message}`);
    }
    const before = await this.redis.get(`${PLAN_KEY}:last`);
    if (found) {
      await this.redis.set(PLAN_KEY, JSON.stringify(found), 'EX', PLAN_REFRESH_SEC);
      if (before !== String(found.limitDay)) {
        await this.redis.set(`${PLAN_KEY}:last`, String(found.limitDay));
        // a new plan may allow other dates: forget the free plan's date window
        await this.redis.del('af:date-window');
        this.logger.log(`api-football plan: ${found.plan} (${found.limitDay}/day, ${found.perMinute}/min)`);
      }
    } else {
      // try again in a few minutes, not on every request
      await this.redis.set(PLAN_KEY, JSON.stringify({ unknown: true }), 'EX', 300);
    }
    return found;
  }

  /** The budgets in force: the plan's (minus a margin) once known, else the configured ones. */
  async budgets(): Promise<{ daily: number; perMinute: number; plan: PlanLimits | null }> {
    const plan = await this.limits();
    const share = plan && this.opts.planShare ? await this.opts.planShare() : DEFAULT_PLAN_SHARE_PCT;
    return { ...planBudgets(plan, this.opts, share), plan };
  }

  async used(): Promise<{ today: number; budget: number; providerRemaining: number | null; plan: PlanLimits | null }> {
    const [today, remaining, b] = await Promise.all([this.redis.get(`af:budget:${day()}`), this.redis.get('af:remaining'), this.budgets()]);
    return { today: Number(today ?? 0), budget: b.daily, providerRemaining: remaining === null ? null : Number(remaining), plan: b.plan };
  }

  private url(path: string) {
    return new URL(path.replace(/^\//, ''), this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`);
  }

  /** Calls left today under our own budget. */
  async remaining(): Promise<number> {
    const u = await this.used();
    const ours = u.budget - u.today;
    return u.providerRemaining === null ? ours : Math.min(ours, u.providerRemaining - 3);
  }

  /** Take one slot from the minute and day budgets; a refused attempt gives its slots back. */
  private async reserve() {
    const { daily, perMinute } = await this.budgets();
    const dayKey = `af:budget:${day()}`;
    const minuteKey = `af:minute:${Math.floor(Date.now() / 60_000)}`;
    const minuteCount = await this.redis.incr(minuteKey);
    await this.redis.expire(minuteKey, 120);
    if (minuteCount > perMinute) {
      await this.redis.decr(minuteKey);
      throw new BudgetExceededError('minute');
    }
    const dayCount = await this.redis.incr(dayKey);
    await this.redis.expire(dayKey, 2 * 86_400);
    if (dayCount > daily) {
      await this.redis.decr(dayKey);
      await this.redis.decr(minuteKey);
      throw new BudgetExceededError('day');
    }
  }

  async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T[]> {
    await this.reserve();
    const url = this.url(path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await fetch(url, { headers: { 'x-apisports-key': this.opts.apiKey }, signal: AbortSignal.timeout(15_000) });
    const remaining = res.headers.get('x-ratelimit-requests-remaining');
    if (remaining !== null) await this.redis.set('af:remaining', remaining, 'EX', 86_400);
    // a different daily limit means the plan changed (upgrade or downgrade): re-read it now
    const limit = res.headers.get('x-ratelimit-requests-limit');
    if (limit !== null) {
      const stored = await this.redis.get(PLAN_KEY);
      const known = stored ? (JSON.parse(stored) as Partial<PlanLimits>) : null;
      if (known?.limitDay !== undefined && known.limitDay !== Number(limit)) await this.redis.del(PLAN_KEY);
    }
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
