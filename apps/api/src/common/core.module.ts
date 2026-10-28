import { Global, Module } from '@nestjs/common';
import { ENV, loadEnv } from '../config/env.js';
import { AuditService } from './audit.service.js';
import { AdminAuthGuard, OptionalUserAuthGuard, UserAuthGuard } from './auth/guards.js';
import { SessionService } from './auth/session.service.js';
import { TokensService } from './auth/tokens.service.js';
import { IdempotencyService } from './idempotency.service.js';
import { MailConfigService } from './mail-config.service.js';
import { MailerService } from './mailer.service.js';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';
import { SettingsService } from './settings.service.js';
import { RedisThrottlerStorage } from './throttler-redis.storage.js';

const providers = [
  { provide: ENV, useFactory: () => loadEnv() },
  PrismaService,
  RedisService,
  AuditService,
  SettingsService,
  MailConfigService,
  MailerService,
  IdempotencyService,
  TokensService,
  SessionService,
  UserAuthGuard,
  OptionalUserAuthGuard,
  AdminAuthGuard,
  RedisThrottlerStorage,
];

/** Infrastructure shared by every module (DB, Redis, audit, settings, auth primitives). */
@Global()
@Module({ providers, exports: providers })
export class CoreModule {}
