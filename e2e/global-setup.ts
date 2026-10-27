import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { API_ENV, ROOT } from './stack.mjs';
import { ADMINS_FILE, type E2EAdmins, type Role, findMatches } from './tests/helpers';

const ROLES: Record<string, Role> = { superAdmin: 'SUPER_ADMIN', operator: 'OPERATOR', finance: 'FINANCE', finance2: 'FINANCE' };

/**
 * Creates one admin per role (two Finance admins for the four-eyes rule) with a known TOTP
 * secret, then waits until the worker has loaded the mock fixtures (upcoming and live matches).
 */
export default async function globalSetup() {
  const db = await import(pathToFileURL(join(ROOT, 'packages/db/dist/index.js')).href);
  const crypto = await import(pathToFileURL(join(ROOT, 'apps/api/dist/common/auth/crypto.js')).href);
  const { generateSecret } = await import('otplib');
  const prisma = new db.PrismaClient({ adapter: new db.PrismaPg({ connectionString: API_ENV.DATABASE_URL }) });

  const admins = {} as E2EAdmins;
  for (const [key, role] of Object.entries(ROLES)) {
    const email = `e2e-${key.toLowerCase()}@goalbet.test`;
    const password = `E2e-${key}-Parola1`;
    const secret = generateSecret();
    const data = {
      name: `E2E ${key}`,
      role,
      passwordHash: await crypto.hashPassword(password),
      totpSecret: crypto.encryptSecret(secret, API_ENV.JWT_ADMIN_SECRET),
      totpEnabled: true,
      totpLastStep: null,
      status: 'ACTIVE',
      failedLogins: 0,
      lockedUntil: null,
      locale: 'ro',
    };
    await prisma.adminUser.upsert({ where: { email }, create: { email, ...data }, update: data });
    admins[key as keyof E2EAdmins] = { email, password, secret, role };
  }
  await prisma.$disconnect();
  mkdirSync(join(ROOT, 'e2e/.auth'), { recursive: true });
  writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2));
  writeFileSync(join(ROOT, 'e2e/.auth/totp-steps.json'), '{}');

  // the worker's first sync loads fixtures, then each match's markets
  const deadline = Date.now() + 180_000;
  for (;;) {
    const ready = await Promise.all([findMatches('upcoming', 3), findMatches('live', 1)]).then(() => true, () => false);
    if (ready) break;
    if (Date.now() > deadline) throw new Error('E2E stack has no matches with markets after 3 minutes: is the worker running?');
    await new Promise((r) => setTimeout(r, 3_000));
  }
}
