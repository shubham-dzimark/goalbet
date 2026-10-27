import { timingSafeEqual } from 'node:crypto';
import { type Env } from '../config/env.js';
import { DomainError } from './errors.js';

/**
 * Scheduled calls on serverless hosts (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
 * Hidden (404) unless JOBS_MODE=on-request and CRON_SECRET is set.
 */
export function assertCron(env: Env, auth: string | undefined) {
  const secret = env.CRON_SECRET;
  if (env.JOBS_MODE !== 'on-request' || !secret) throw new DomainError('NOT_FOUND');
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(auth ?? '');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new DomainError('UNAUTHORIZED');
}
