import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Actor, AuditService } from '../../common/audit.service.js';
import { decryptSecret, encryptSecret } from '../../common/auth/crypto.js';
import { DomainError } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { Channels, RedisService } from '../../common/redis.service.js';
import { ENV, type Env } from '../../config/env.js';
import { API_FOOTBALL_LEAGUES } from './api-football/api-football.provider.js';

export type ProviderName = 'mock' | 'api-football';

export interface EffectiveProviderConfig {
  /** where it comes from: the admin panel, or the env vars until an admin saves one */
  source: 'admin' | 'env';
  provider: ProviderName;
  apiKey: string | null;
  apiKeyHint: string | null;
  leagues: number[];
  dailyBudget: number;
  perMinute: number;
  /** changes whenever the config changes; the router rebuilds its provider on a new version */
  version: string;
  updatedAt: string | null;
}

export interface ApiFootballStatus {
  ok: boolean;
  plan?: string;
  active?: boolean;
  subscriptionEnd?: string | null;
  requestsToday?: number;
  limitDay?: number;
  error?: string;
}

const CACHE_MS = 15_000;
const hint = (key: string) => key.slice(-4);

/**
 * The sports-data provider settings (Super admin → Data provider). Stored in one encrypted row;
 * every API and worker process re-reads it within 15 s, or at once on a Redis notice, so switching
 * provider or key needs no restart. The API key is sealed with AES-256-GCM and never leaves the
 * server; only its last 4 characters are shown.
 */
@Injectable()
export class ProviderConfigService implements OnModuleInit {
  private readonly logger = new Logger('ProviderConfig');
  private cache: { at: number; value: EffectiveProviderConfig } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit() {
    await this.redis.subscribe(Channels.PROVIDER_CHANGED, () => this.invalidate());
  }

  /** Drops the cached config; the next call reads the database. */
  invalidate() {
    this.cache = null;
  }

  private get keyMaterial() {
    // separate from the 2FA secrets' key even though it derives from the same server secret
    return `${this.env.JWT_ADMIN_SECRET}:data-provider-key`;
  }

  private fromEnv(): EffectiveProviderConfig {
    const key = this.env.API_FOOTBALL_KEY || null;
    return {
      source: 'env',
      provider: this.env.ODDS_PROVIDER,
      apiKey: key,
      apiKeyHint: key ? hint(key) : null,
      leagues: this.env.API_FOOTBALL_LEAGUES,
      dailyBudget: this.env.API_FOOTBALL_DAILY_BUDGET,
      perMinute: this.env.API_FOOTBALL_PER_MINUTE,
      version: 'env',
      updatedAt: null,
    };
  }

  async effective(): Promise<EffectiveProviderConfig> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const row = await this.prisma.dataProviderConfig.findUnique({ where: { id: 'default' } }).catch(() => null);
    let value = this.fromEnv();
    if (row) {
      let apiKey: string | null = null;
      if (row.apiKeyEnc) {
        try {
          apiKey = decryptSecret(row.apiKeyEnc, this.keyMaterial);
        } catch {
          this.logger.error('stored data-provider key cannot be decrypted (server secret changed?)');
        }
      }
      value = {
        source: 'admin',
        provider: row.provider as ProviderName,
        // no key stored: keep using the env key, if any
        apiKey: apiKey ?? value.apiKey,
        apiKeyHint: row.apiKeyHint ?? value.apiKeyHint,
        leagues: row.leagues.length ? row.leagues : value.leagues,
        dailyBudget: row.dailyBudget,
        perMinute: row.perMinute,
        version: `admin:${row.updatedAt.getTime()}`,
        updatedAt: row.updatedAt.toISOString(),
      };
    }
    this.cache = { at: Date.now(), value };
    return value;
  }

  /** Save from the admin panel. `apiKey`: string = replace, null = remove, undefined = keep. */
  async save(
    actor: Actor & { id: string },
    input: { provider: ProviderName; apiKey?: string | null | undefined; leagues: number[]; dailyBudget: number; perMinute: number; reason: string },
  ) {
    const before = await this.effective();
    const row = await this.prisma.dataProviderConfig.findUnique({ where: { id: 'default' } });
    const keyChange =
      input.apiKey === undefined
        ? {}
        : input.apiKey === null
          ? { apiKeyEnc: null, apiKeyHint: null }
          : { apiKeyEnc: encryptSecret(input.apiKey, this.keyMaterial), apiKeyHint: hint(input.apiKey) };
    const willHaveKey = input.apiKey ? true : input.apiKey === null ? !!this.env.API_FOOTBALL_KEY : !!(row?.apiKeyEnc ?? this.env.API_FOOTBALL_KEY);
    if (input.provider === 'api-football' && !willHaveKey) throw new DomainError('VALIDATION_FAILED', { fields: { apiKey: 'validation.required' } });
    const unknown = input.leagues.filter((id) => !(id in API_FOOTBALL_LEAGUES));
    if (unknown.length) throw new DomainError('VALIDATION_FAILED', { fields: { leagues: 'validation.required' }, unknown });

    const data = { provider: input.provider, leagues: input.leagues, dailyBudget: input.dailyBudget, perMinute: input.perMinute, updatedById: actor.id, ...keyChange };
    await this.prisma.$transaction(async (tx) => {
      await tx.dataProviderConfig.upsert({ where: { id: 'default' }, create: { id: 'default', ...data }, update: data });
      await this.audit.log(
        {
          category: 'ADMIN',
          action: 'DATA_PROVIDER_UPDATED',
          actor,
          entityType: 'DataProvider',
          entityId: 'default',
          // the key itself is never logged, only whether / how it changed
          before: { provider: before.provider, source: before.source, apiKeyHint: before.apiKeyHint, leagues: before.leagues, dailyBudget: before.dailyBudget, perMinute: before.perMinute },
          after: { provider: input.provider, apiKey: input.apiKey === undefined ? 'unchanged' : input.apiKey === null ? 'removed' : `replaced (…${hint(input.apiKey)})`, leagues: input.leagues, dailyBudget: input.dailyBudget, perMinute: input.perMinute },
          meta: { reason: input.reason },
        },
        tx,
      );
    });
    this.cache = null;
    await this.redis.publish(Channels.PROVIDER_CHANGED, { at: Date.now() });
    return this.effective();
  }

  /** Checks a key against API-Football's /status (does not count against the daily quota). */
  async testApiFootball(candidateKey?: string): Promise<ApiFootballStatus> {
    const key = candidateKey || (await this.effective()).apiKey;
    if (!key) return { ok: false, error: 'NO_KEY' };
    try {
      const base = this.env.API_FOOTBALL_BASE_URL.endsWith('/') ? this.env.API_FOOTBALL_BASE_URL : `${this.env.API_FOOTBALL_BASE_URL}/`;
      const res = await fetch(new URL('status', base), { headers: { 'x-apisports-key': key }, signal: AbortSignal.timeout(10_000) });
      const body = (await res.json()) as {
        errors?: Record<string, string> | unknown[];
        response?: { subscription?: { plan?: string; end?: string; active?: boolean }; requests?: { current?: number; limit_day?: number } } | unknown[];
      };
      const errors = body.errors && !Array.isArray(body.errors) ? Object.values(body.errors) : [];
      if (!res.ok || errors.length || Array.isArray(body.response) || !body.response) {
        return { ok: false, error: errors[0] ?? `HTTP ${res.status}` };
      }
      const r = body.response;
      return {
        ok: true,
        plan: r.subscription?.plan ?? 'unknown',
        active: r.subscription?.active ?? false,
        subscriptionEnd: r.subscription?.end ?? null,
        requestsToday: r.requests?.current ?? 0,
        limitDay: r.requests?.limit_day ?? 0,
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
