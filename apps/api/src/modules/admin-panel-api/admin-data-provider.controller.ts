import { Controller, Get, HttpCode, Logger, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { type AdminDataProviderStatus, adminDataProviderTestSchema, adminDataProviderUpdateSchema } from '@goalbet/shared';
import { AuditService } from '../../common/audit.service.js';
import { AdminAuthGuard, type AuthedAdmin, CurrentAdmin, Roles } from '../../common/auth/guards.js';
import { RedisService } from '../../common/redis.service.js';
import { ReqMeta, type RequestMeta } from '../../common/request-meta.js';
import { SettingsService } from '../../common/settings.service.js';
import { ZBody } from '../../common/zod.js';
import { API_FOOTBALL_LEAGUES } from '../api-integration/api-football/api-football.provider.js';
import { ProviderConfigService } from '../api-integration/provider-config.service.js';
import { IngestService } from '../odds-management/ingest.service.js';
import { SyncTasksService } from '../odds-management/sync-tasks.service.js';
import { actorOf } from './admin-actor.js';

/** F4.1 sports-data provider and API key, managed by Super admins (no server access needed). */
@ApiTags('admin-data-provider')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Roles('SUPER_ADMIN')
@Controller('admin/data-provider')
export class AdminDataProviderController {
  private readonly logger = new Logger('DataProvider');

  constructor(
    private readonly config: ProviderConfigService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
    private readonly ingest: IngestService,
    private readonly tasks: SyncTasksService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async status(): Promise<AdminDataProviderStatus> {
    const cfg = await this.config.effective();
    const day = new Date().toISOString().slice(0, 10);
    const [today, remaining, last, stallSeconds] = await Promise.all([
      this.redis.client.get(`af:budget:${day}`),
      this.redis.client.get('af:remaining'),
      this.ingest.lastLiveSync(),
      this.settings.get('feed.stallSeconds'),
    ]);
    return {
      provider: cfg.provider,
      source: cfg.source,
      apiKey: { set: !!cfg.apiKey, hint: cfg.apiKeyHint },
      leagues: Object.entries(API_FOOTBALL_LEAGUES).map(([id, l]) => ({ id: Number(id), name: l.name, country: l.country, countryCode: l.countryCode, selected: cfg.leagues.includes(Number(id)) })),
      dailyBudget: cfg.dailyBudget,
      perMinute: cfg.perMinute,
      updatedAt: cfg.updatedAt,
      usage: cfg.provider === 'api-football' ? { today: Number(today ?? 0), budget: cfg.dailyBudget, providerRemaining: remaining === null ? null : Number(remaining) } : null,
      feed: { lastLiveDataAt: last ? new Date(last).toISOString() : null, ageSeconds: last ? Math.round((Date.now() - last) / 1000) : null, stallSeconds },
    };
  }

  @Put()
  async update(@CurrentAdmin() admin: AuthedAdmin, @ZBody(adminDataProviderUpdateSchema) body: z.output<typeof adminDataProviderUpdateSchema>, @ReqMeta() meta: RequestMeta) {
    await this.config.save({ ...actorOf(admin, meta), id: admin.id }, body);
    return this.status();
  }

  /** Check a key (the typed one, or the stored one) without saving anything. */
  @Post('test')
  @HttpCode(200)
  test(@ZBody(adminDataProviderTestSchema) body: z.output<typeof adminDataProviderTestSchema>) {
    return this.config.testApiFootball(body.apiKey);
  }

  /** Load leagues and fixtures from the active provider now, instead of at the next 5-minute sync. */
  @Post('sync')
  @HttpCode(202)
  async sync(@CurrentAdmin() admin: AuthedAdmin, @ReqMeta() meta: RequestMeta) {
    await this.audit.log({ category: 'ADMIN', action: 'DATA_PROVIDER_SYNC', actor: actorOf(admin, meta), entityType: 'DataProvider', entityId: 'default' });
    void this.tasks.fixtures().catch((e: unknown) => this.logger.warn(`manual sync failed: ${(e as Error).message}`));
    return { started: true };
  }
}
