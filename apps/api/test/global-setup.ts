import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';

/**
 * Test infrastructure for API integration tests:
 * - TEST_DATABASE_URL / TEST_REDIS_URL set (env or apps/api/.env.test) → use them (see scripts/local-services.sh)
 * - otherwise → start throwaway PostgreSQL 16 + Redis 7 with Testcontainers (CI).
 * Migrations are applied before any test runs.
 */
export default async function setup(project: TestProject) {
  // Optional local overrides (gitignored), e.g. TEST_DATABASE_URL for machines without Docker.
  const local = fileURLToPath(new URL('../.env.test', import.meta.url));
  if (existsSync(local)) process.loadEnvFile(local);

  let databaseUrl = process.env['TEST_DATABASE_URL'];
  let redisUrl = process.env['TEST_REDIS_URL'];
  const stops: (() => Promise<unknown>)[] = [];

  if (!databaseUrl) {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const pg = await new PostgreSqlContainer('postgres:16-alpine').withDatabase('goalbet_test').start();
    databaseUrl = pg.getConnectionUri();
    stops.push(() => pg.stop());
  }
  if (!redisUrl) {
    const { RedisContainer } = await import('@testcontainers/redis');
    const redis = await new RedisContainer('redis:7-alpine').start();
    redisUrl = redis.getConnectionUrl();
    stops.push(() => redis.stop());
  }

  const dbDir = fileURLToPath(new URL('../../../packages/db', import.meta.url));
  execSync('npx prisma migrate deploy', { cwd: dbDir, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' });

  project.provide('databaseUrl', databaseUrl);
  project.provide('redisUrl', redisUrl);

  return async () => {
    for (const stop of stops) await stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
  }
}
