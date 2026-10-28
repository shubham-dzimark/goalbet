import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().default(10),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ADMIN_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
  ADMIN_IDLE_TIMEOUT_MIN: z.coerce.number().int().default(30),
  ADMIN_SESSION_MAX_HOURS: z.coerce.number().int().default(12),
  COOKIE_SECURE: bool.default(false),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  ADMIN_ORIGIN: z.string().default('http://localhost:3001'),
  /** Behind a proxy/load balancer, trust X-Forwarded-* for client IPs. */
  TRUST_PROXY: bool.default(true),
  ODDS_PROVIDER: z.enum(['mock', 'api-football']).default('mock'),
  API_FOOTBALL_KEY: z.string().optional(),
  API_FOOTBALL_BASE_URL: z.string().default('https://v3.football.api-sports.io'),
  /** Comma-separated API-Football league ids (default: the 7 competitions from the brief). */
  API_FOOTBALL_LEAGUES: z
    .string()
    .default('283,39,140,135,78,61,2')
    .transform((s) => s.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0)),
  /** Our own cap per UTC day (free plan: 100). */
  API_FOOTBALL_DAILY_BUDGET: z.coerce.number().int().min(1).default(90),
  API_FOOTBALL_PER_MINUTE: z.coerce.number().int().min(1).default(8),
  /**
   * How the background sync runs: `worker` = apps/worker on an always-on host (BullMQ);
   * `on-request` = serverless (Vercel): catalogue visits refresh stale data, plus a daily cron.
   */
  JOBS_MODE: z.enum(['worker', 'on-request']).default('worker'),
  /** Bearer secret for GET /cron/refresh (Vercel Cron sends it). */
  CRON_SECRET: z.string().min(16).optional(),
  /** Where players send bank-transfer deposits (shown on the wallet page). Placeholders until real details exist. */
  PAYMENT_BANK_BENEFICIARY: z.string().default('GoalBet Demo SRL'),
  PAYMENT_BANK_IBAN: z.string().default('RO49AAAA1B31007593840000'),
  PAYMENT_BANK_NAME: z.string().default('Demo Bank'),
  /** Dev/test-only endpoints to drive the mock provider (never in production). */
  MOCK_CONTROL_ENABLED: bool.default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: bool.default(false),
  SENTRY_DSN: z.string().optional(),
  /** Outgoing email (password resets), e.g. smtps://user:pass@smtp.example.com:465. Unset = log only. */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('GoalBet <no-reply@goalbet.local>'),
  /** Local production-mode demo only (docker-compose over http): unsafe settings warn instead of failing. */
  ALLOW_INSECURE_LOCAL: bool.default(false),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  // Upstash Redis added from the Vercel Marketplace exposes its URL as KV_URL
  const parsed = envSchema.safeParse({ ...source, REDIS_URL: source['REDIS_URL'] || source['KV_URL'] || undefined });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid environment:\n  ${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production') checkProduction(parsed.data);
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

/**
 * Refuses to start production with settings that are only safe on a laptop; warns about demo
 * values that still need replacing.
 */
export function checkProduction(env: Env) {
  const problems: string[] = [];
  if (env.MOCK_CONTROL_ENABLED) problems.push('MOCK_CONTROL_ENABLED must be false');
  if (!env.COOKIE_SECURE) problems.push('COOKIE_SECURE must be true (HTTPS only)');
  for (const k of ['JWT_ACCESS_SECRET', 'JWT_ADMIN_SECRET'] as const) {
    if (/change-me/i.test(env[k])) problems.push(`${k} is still the example value`);
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_ADMIN_SECRET) problems.push('JWT_ACCESS_SECRET and JWT_ADMIN_SECRET must differ');
  if (problems.length && !env.ALLOW_INSECURE_LOCAL) throw new Error(`Unsafe production configuration:\n  ${problems.join('\n  ')}`);

  const warnings = env.ALLOW_INSECURE_LOCAL ? problems.map((p) => `${p} (allowed by ALLOW_INSECURE_LOCAL)`) : [];
  if (env.PAYMENT_BANK_IBAN === 'RO49AAAA1B31007593840000') warnings.push('PAYMENT_BANK_* still shows the demo bank account');
  if (!env.SMTP_URL) warnings.push('SMTP_URL is not set: set up outgoing email in Admin → Email, or emails are only logged');
  if (!env.SENTRY_DSN) warnings.push('SENTRY_DSN is not set: errors are only in the logs');
  for (const w of warnings) console.warn(`[config] ${w}`);
}

export const ENV = Symbol('ENV');
