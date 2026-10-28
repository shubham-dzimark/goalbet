// Prepares the E2E stack: a fresh goalbet_e2e database (migrated), an empty Redis DB, the API and
// worker builds, and Next.js builds of web + admin pointed at the E2E API.
//   pnpm --filter @goalbet/e2e prepare-stack            (reuses existing Next builds)
//   pnpm --filter @goalbet/e2e prepare-stack --rebuild  (after changing web/admin code)
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { API_ENV, DB_ADMIN_URL, NEXT_ENV, ROOT } from '../stack.mjs';

const rebuild = process.argv.includes('--rebuild');
const run = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts, env: { ...process.env, ...opts.env } });

// 1. fresh database
const req = createRequire(join(ROOT, 'packages/db/package.json'));
const { Client } = req('pg');
const admin = new Client({ connectionString: DB_ADMIN_URL });
await admin.connect();
await admin.query('DROP DATABASE IF EXISTS goalbet_e2e WITH (FORCE)');
await admin.query('CREATE DATABASE goalbet_e2e');
await admin.end();
console.log('e2e: database goalbet_e2e recreated');
run('npx prisma migrate deploy', { cwd: join(ROOT, 'packages/db'), env: { DATABASE_URL: API_ENV.DATABASE_URL } });

// 2. empty Redis DB (queues, caches, mock overrides)
const redisReq = createRequire(join(ROOT, 'apps/api/package.json'));
const { Redis } = redisReq('ioredis');
const redis = new Redis(API_ENV.REDIS_URL);
await redis.flushdb();
await redis.quit();
console.log('e2e: redis db flushed');

// 3. builds
run('pnpm turbo run build --filter=@goalbet/api --filter=@goalbet/worker');
for (const app of ['web', 'admin']) {
  const dir = join(ROOT, 'apps', app);
  if (!rebuild && existsSync(join(dir, '.next-e2e', 'BUILD_ID'))) {
    console.log(`e2e: reusing ${app} build (pass --rebuild after UI changes)`);
    continue;
  }
  // `next build` points next-env.d.ts at the build folder; keep the committed version
  const envFile = join(dir, 'next-env.d.ts');
  const original = existsSync(envFile) ? readFileSync(envFile, 'utf8') : null;
  try {
    run('npx next build', { cwd: dir, env: NEXT_ENV });
  } finally {
    if (original !== null) writeFileSync(envFile, original);
  }
}
console.log('e2e: stack ready — run `pnpm --filter @goalbet/e2e e2e`');
