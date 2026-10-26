import { Injectable, OnModuleInit } from '@nestjs/common';
import { SETTING_DEFAULTS, type SettingKey, type Settings } from '@goalbet/shared';
import { type Prisma } from '@goalbet/db';
import { type Actor, AuditService } from './audit.service.js';
import { PrismaService } from './prisma.service.js';
import { Channels, RedisService } from './redis.service.js';

const CACHE_MS = 5_000;

/** Admin-editable settings (F3.5) with defaults; cached briefly and invalidated across instances via Redis. */
@Injectable()
export class SettingsService implements OnModuleInit {
  private cache: { at: number; value: Settings } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    await this.redis.subscribe(Channels.SETTINGS_CHANGED, () => this.invalidate());
  }

  /** Drops the local cache; the next read goes to the database. */
  invalidate() {
    this.cache = null;
  }

  async all(): Promise<Settings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const rows = await this.prisma.setting.findMany();
    const value = { ...SETTING_DEFAULTS } as Settings;
    for (const r of rows) {
      if (r.key in SETTING_DEFAULTS) (value as Record<string, unknown>)[r.key] = r.value;
    }
    this.cache = { at: Date.now(), value };
    return value;
  }

  async get<K extends SettingKey>(key: K): Promise<Settings[K]> {
    return (await this.all())[key];
  }

  async set<K extends SettingKey>(key: K, value: Settings[K], actor: Actor) {
    const before = await this.get(key);
    await this.prisma.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, updatedBy: actor.id ?? null },
        update: { value: value as Prisma.InputJsonValue, updatedBy: actor.id ?? null },
      });
      await this.audit.log(
        { category: 'ADMIN', action: 'SETTING_UPDATED', actor, entityType: 'Setting', entityId: key, before, after: value },
        tx,
      );
    });
    this.cache = null;
    await this.redis.publish(Channels.SETTINGS_CHANGED, { key });
  }
}
