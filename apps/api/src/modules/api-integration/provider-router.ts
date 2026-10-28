import { Logger } from '@nestjs/common';
import { type RedisService } from '../../common/redis.service.js';
import { ApiFootballClient } from './api-football/api-football.client.js';
import { ApiFootballProvider } from './api-football/api-football.provider.js';
import { MockProvider } from './mock/mock.provider.js';
import { type BuilderPriceRequest, type OddsProvider } from './odds-provider.js';
import { type EffectiveProviderConfig, type ProviderConfigService } from './provider-config.service.js';

/**
 * The OddsProvider the rest of the engine sees. It forwards every call to the provider currently
 * configured in the admin panel (or env), rebuilding it when the config version changes — so an
 * admin can switch provider or API key without restarting the API or the worker.
 */
export class ProviderRouter implements OddsProvider {
  private readonly logger = new Logger('ProviderRouter');
  private current: { version: string; provider: OddsProvider; config: EffectiveProviderConfig } | null = null;
  private building: Promise<OddsProvider> | null = null;

  constructor(
    private readonly config: ProviderConfigService,
    private readonly redis: RedisService,
    private readonly baseUrl: string,
  ) {}

  /** The provider for this call, rebuilt after a config change. */
  async resolve(): Promise<OddsProvider> {
    const cfg = await this.config.effective();
    if (this.current?.version === cfg.version) return this.current.provider;
    this.building ??= Promise.resolve().then(() => {
      const provider = this.build(cfg);
      if (this.current) this.logger.log(`data provider switched to ${provider.name} (${cfg.source})`);
      this.current = { version: cfg.version, provider, config: cfg };
      return provider;
    });
    try {
      return await this.building;
    } finally {
      this.building = null;
    }
  }

  private build(cfg: EffectiveProviderConfig): OddsProvider {
    if (cfg.provider === 'api-football') {
      if (!cfg.apiKey) throw new Error('API-Football is selected but no API key is set (Admin → Data provider)');
      const client = new ApiFootballClient(
        { apiKey: cfg.apiKey, baseUrl: this.baseUrl, dailyBudget: cfg.dailyBudget, perMinute: cfg.perMinute },
        this.redis.client,
      );
      return new ApiFootballProvider(client, this.redis.client, cfg.leagues);
    }
    return new MockProvider(this.redis);
  }

  /** The mock provider when it is the active one (test controls), otherwise null. */
  async mock(): Promise<MockProvider | null> {
    const p = await this.resolve();
    return p instanceof MockProvider ? p : null;
  }

  get name() {
    return this.current?.provider.name ?? 'pending';
  }

  get capabilities() {
    return this.current?.provider.capabilities ?? { betBuilderPricing: false, cashOutData: false };
  }

  async getCompetitions() {
    return (await this.resolve()).getCompetitions();
  }

  async getFixtures(from: Date, to: Date) {
    return (await this.resolve()).getFixtures(from, to);
  }

  async getMarkets(fixtureRef: string) {
    return (await this.resolve()).getMarkets(fixtureRef);
  }

  async getLiveStates() {
    return (await this.resolve()).getLiveStates();
  }

  async getResult(fixtureRef: string, kickoff?: Date) {
    return (await this.resolve()).getResult(fixtureRef, kickoff);
  }

  async liveDataTime() {
    const p = await this.resolve();
    return p.liveDataTime ? p.liveDataTime() : null;
  }

  async priceBetBuilder(fixtureRef: string, selections: BuilderPriceRequest[]) {
    const p = await this.resolve();
    return p.priceBetBuilder ? p.priceBetBuilder(fixtureRef, selections) : null;
  }

  async getCashOutValue(ticketRef: string) {
    const p = await this.resolve();
    return p.getCashOutValue ? p.getCashOutValue(ticketRef) : null;
  }
}
