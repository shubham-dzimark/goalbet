import { Injectable } from '@nestjs/common';
import { type OddsMilli, parseMarketKey } from '@goalbet/shared';
import { RedisService } from '../../../common/redis.service.js';
import {
  type BuilderPriceRequest,
  type OddsProvider,
  type ProviderCompetition,
  type ProviderFixture,
  type ProviderLiveState,
  type ProviderMarket,
  type ProviderResult,
} from '../odds-provider.js';
import { MOCK_COMPETITIONS } from './data.js';
import { priceBuilderJoint, priceMarkets } from './pricing.js';
import {
  type MockOverride,
  SLOT_MS,
  finalOutcome,
  fixtureSeed,
  liveState,
  pricingState,
  slotOf,
  toFixture,
} from './simulation.js';

const OVERRIDES_KEY = 'mock:overrides';
const STALL_KEY = 'mock:stall-until';
const LIVE_WINDOW_MS = 4 * 3600_000;

export class FeedStalledError extends Error {
  constructor() {
    super('mock feed stalled');
  }
}

/**
 * F4.1 MockProvider — realistic, deterministic football feed:
 * SuperLiga, Premier League, LaLiga, Serie A, Bundesliga, Ligue 1 and Champions League,
 * a kickoff every 30 minutes for the next 7 days (so 3–5 matches are always live), minute-by-minute
 * goals / corners / cards, Poisson odds with drift, random suspensions and final results.
 * Test control (kick off now, finish, set score, move odds, suspend, stall feed) lives in Redis so
 * every API/worker process sees the same world.
 */
@Injectable()
export class MockProvider implements OddsProvider {
  readonly name = 'mock';
  readonly capabilities = { betBuilderPricing: true, cashOutData: false };

  private overridesCache: { at: number; value: Map<string, MockOverride> } | null = null;

  constructor(private readonly redis: RedisService) {}

  private now() {
    return Date.now();
  }

  private async overrides(): Promise<Map<string, MockOverride>> {
    if (this.overridesCache && this.now() - this.overridesCache.at < 500) return this.overridesCache.value;
    const raw = await this.redis.client.hgetall(OVERRIDES_KEY);
    const value = new Map(Object.entries(raw).map(([k, v]) => [k, JSON.parse(v) as MockOverride]));
    this.overridesCache = { at: this.now(), value };
    return value;
  }

  private async override(ref: string) {
    return (await this.overrides()).get(ref);
  }

  async getCompetitions(): Promise<ProviderCompetition[]> {
    return MOCK_COMPETITIONS.map((c, i) => ({
      ref: c.ref,
      name: c.name,
      country: c.country,
      countryCode: c.countryCode,
      isTop: c.isTop,
      sortOrder: i,
    }));
  }

  async getFixtures(from: Date, to: Date): Promise<ProviderFixture[]> {
    const ov = await this.overrides();
    const out = new Map<string, ProviderFixture>();
    for (let slot = Math.floor(from.getTime() / SLOT_MS); slot * SLOT_MS <= to.getTime(); slot++) {
      const seed = fixtureSeed(slot);
      const f = toFixture(seed, ov.get(seed.ref));
      if (f.startTime >= from && f.startTime <= to) out.set(f.ref, f);
    }
    for (const [ref, o] of ov) {
      const slot = slotOf(ref);
      if (slot === null || out.has(ref)) continue;
      const f = toFixture(fixtureSeed(slot), o);
      if (f.startTime >= from && f.startTime <= to) out.set(ref, f);
    }
    return [...out.values()];
  }

  async getMarkets(fixtureRef: string): Promise<ProviderMarket[]> {
    const slot = slotOf(fixtureRef);
    if (slot === null) return [];
    const state = pricingState(fixtureSeed(slot), this.now(), await this.override(fixtureRef));
    return state ? priceMarkets(state) : [];
  }

  async getLiveStates(): Promise<ProviderLiveState[]> {
    const stallUntil = Number(await this.redis.client.get(STALL_KEY));
    if (stallUntil && stallUntil > this.now()) throw new FeedStalledError();
    const now = this.now();
    const ov = await this.overrides();
    const refs = new Set<string>();
    for (let slot = Math.floor((now - LIVE_WINDOW_MS) / SLOT_MS); slot * SLOT_MS <= now; slot++) refs.add(`mock-${slot}`);
    for (const ref of ov.keys()) refs.add(ref);
    const out: ProviderLiveState[] = [];
    for (const ref of refs) {
      const slot = slotOf(ref);
      if (slot === null) continue;
      const st = liveState(fixtureSeed(slot), now, ov.get(ref));
      if (st.status !== 'SCHEDULED') out.push(st);
    }
    return out;
  }

  async getResult(fixtureRef: string): Promise<ProviderResult | null> {
    const slot = slotOf(fixtureRef);
    if (slot === null) return null;
    const outcome = finalOutcome(fixtureSeed(slot), this.now(), await this.override(fixtureRef));
    if (!outcome) return null;
    return { ref: fixtureRef, status: outcome.cancelled ? 'CANCELLED' : 'FINISHED', outcome };
  }

  async priceBetBuilder(fixtureRef: string, selections: BuilderPriceRequest[]): Promise<OddsMilli | null> {
    const slot = slotOf(fixtureRef);
    if (slot === null) return null;
    const state = pricingState(fixtureSeed(slot), this.now(), await this.override(fixtureRef));
    if (!state || state.suspended) return null;
    return priceBuilderJoint(
      state,
      selections.map((s) => ({ spec: parseMarketKey(s.marketKey), outcome: s.outcome })),
    );
  }

  // ───────────── test / demo control (MockControlController, dev only) ─────────────

  async setOverride(ref: string, patch: Partial<MockOverride>) {
    const current = (await this.override(ref)) ?? {};
    const next = { ...current, ...patch };
    await this.redis.client.hset(OVERRIDES_KEY, ref, JSON.stringify(next));
    this.overridesCache = null;
    return next;
  }

  async clearOverride(ref?: string) {
    if (ref) await this.redis.client.hdel(OVERRIDES_KEY, ref);
    else await this.redis.client.del(OVERRIDES_KEY);
    this.overridesCache = null;
  }

  async stallFeed(ms: number) {
    await this.redis.client.set(STALL_KEY, String(this.now() + ms), 'PX', ms);
  }

  async resumeFeed() {
    await this.redis.client.del(STALL_KEY);
  }
}
