// The isolated E2E stack: its own database, Redis DB and ports, and the deterministic mock feed,
// so the browser tests never touch development data and always have live matches to bet on.
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

const DB_BASE = process.env.E2E_DB_BASE ?? 'postgresql://goalbet@127.0.0.1:5434';
const REDIS_BASE = process.env.E2E_REDIS_BASE ?? 'redis://127.0.0.1:6379';

export const PORTS = { api: 4400, web: 3400, admin: 3401 };
export const URLS = {
  api: `http://127.0.0.1:${PORTS.api}`,
  web: `http://localhost:${PORTS.web}`,
  admin: `http://localhost:${PORTS.admin}`,
};

/** Environment for the API and the worker. Secrets are fixed: this stack only ever runs locally. */
export const API_ENV = {
  NODE_ENV: 'development',
  PORT: String(PORTS.api),
  DATABASE_URL: `${DB_BASE}/goalbet_e2e`,
  REDIS_URL: `${REDIS_BASE}/3`,
  JWT_ACCESS_SECRET: 'e2e-access-secret-e2e-access-secret-0001',
  JWT_ADMIN_SECRET: 'e2e-admin-secret-e2e-admin-secret-000001',
  WEB_ORIGIN: URLS.web,
  ADMIN_ORIGIN: URLS.admin,
  COOKIE_SECURE: 'false',
  ODDS_PROVIDER: 'mock',
  API_FOOTBALL_KEY: '',
  MOCK_CONTROL_ENABLED: 'true',
  LOG_LEVEL: 'warn',
  LOG_PRETTY: 'false',
};

/** Environment for building and serving the two Next.js apps against the E2E API. */
export const NEXT_ENV = { API_URL: URLS.api, NEXT_DIST_DIR: '.next-e2e', NEXT_TELEMETRY_DISABLED: '1' };

export const DB_ADMIN_URL = `${DB_BASE}/postgres`;
