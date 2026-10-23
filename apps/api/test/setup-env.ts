import { inject } from 'vitest';

// Must run before any app module is imported (env is read at import time).
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: inject('databaseUrl'),
  DATABASE_POOL_MAX: '5',
  REDIS_URL: inject('redisUrl'),
  JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret-0001',
  JWT_ADMIN_SECRET: 'test-admin-secret-test-admin-secret-00001',
  MOCK_CONTROL_ENABLED: 'true',
  ODDS_PROVIDER: 'mock',
  LOG_LEVEL: 'error',
  LOG_PRETTY: 'false',
});
