import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';
export { PrismaPg };

export interface CreatePrismaOptions {
  url?: string;
  /** Pool size per process; keep small so the API scales horizontally (F5.10). */
  max?: number;
}

/** Prisma 7 client over the node-postgres driver adapter. */
export function createPrismaClient(opts: CreatePrismaOptions = {}): PrismaClient {
  const connectionString = opts.url ?? process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const adapter = new PrismaPg({ connectionString, max: opts.max ?? 10 });
  return new PrismaClient({ adapter });
}

/** Transaction client type for helpers that must run inside $transaction. */
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
