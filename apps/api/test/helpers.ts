import { randomInt } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { generate, generateSecret } from 'otplib';
import request from 'supertest';
import { type AdminRole } from '@goalbet/shared';

export interface TestContext {
  app: INestApplication;
  http: () => ReturnType<typeof request.agent>;
  prisma: import('../src/common/prisma.service.js').PrismaService;
  redis: import('../src/common/redis.service.js').RedisService;
  close: () => Promise<void>;
}

/** Each agent gets its own client IP so per-IP rate limits do not leak between tests. */
function agent(app: INestApplication) {
  const ip = `10.${randomInt(255)}.${randomInt(255)}.${randomInt(1, 255)}`;
  return request.agent(app.getHttpServer()).set('X-Forwarded-For', ip);
}

export async function createTestApp(): Promise<TestContext> {
  const { AppModule } = await import('../src/app.module.js');
  const { configureApp } = await import('../src/bootstrap.js');
  const { loadEnv } = await import('../src/config/env.js');
  const { PrismaService } = await import('../src/common/prisma.service.js');
  const { RedisService } = await import('../src/common/redis.service.js');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app, loadEnv(), { logger: false });
  await app.init();
  return {
    app,
    http: () => agent(app),
    prisma: app.get(PrismaService),
    redis: app.get(RedisService),
    close: () => app.close(),
  };
}

/** Wipe every table (TRUNCATE bypasses the append-only triggers) and the test Redis DB. */
export async function resetDb(ctx: TestContext) {
  const tables = await ctx.prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await ctx.prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await ctx.redis.client.flushdb();
  // settings are cached in memory for a few seconds; a reset must not leak them into the next test
  const { SettingsService } = await import('../src/common/settings.service.js');
  ctx.app.get(SettingsService).invalidate();
  const { ProviderConfigService } = await import('../src/modules/api-integration/provider-config.service.js');
  ctx.app.get(ProviderConfigService).invalidate();
}

export const validRegistration = (n = randomInt(1_000_000)) => ({
  name: 'Test Player',
  email: `player${n}@example.com`,
  phone: `07${String(n).padStart(8, '0')}`,
  password: 'Parola123',
  dateOfBirth: '1990-05-01',
  acceptTerms: true,
});

export async function registerPlayer(ctx: TestContext, n?: number) {
  const body = validRegistration(n);
  const res = await ctx.http().post('/auth/register').send(body).expect(201);
  return { ...body, id: res.body.user.id as string, token: res.body.accessToken as string };
}

export async function createAdmin(ctx: TestContext, role: AdminRole, opts: { totp?: boolean } = {}) {
  const { hashPassword, encryptSecret } = await import('../src/common/auth/crypto.js');
  const secret = generateSecret();
  const password = `Admin-${randomInt(1_000_000)}`;
  const email = `${role.toLowerCase()}-${randomInt(1_000_000)}@goalbet.test`;
  const admin = await ctx.prisma.adminUser.create({
    data: {
      email,
      name: role,
      role,
      passwordHash: await hashPassword(password),
      totpEnabled: opts.totp !== false,
      totpSecret: opts.totp === false ? null : encryptSecret(secret, process.env['JWT_ADMIN_SECRET']!),
    },
  });
  return { id: admin.id, email, password, secret };
}

export async function adminLogin(ctx: TestContext, a: { email: string; password: string; secret: string }) {
  const res = await ctx
    .http()
    .post('/admin/auth/login')
    .send({ email: a.email, password: a.password, totp: await generate({ secret: a.secret }) })
    .expect(200);
  return res.body.accessToken as string;
}
