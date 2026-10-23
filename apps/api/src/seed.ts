import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { generateSecret, generateURI } from 'otplib';
import { type AdminRole, SETTING_DEFAULTS } from '@goalbet/shared';
import { type Prisma } from '@goalbet/db';
import { brandName } from './config/brand.js';
import { loadEnv } from './config/env.js';
import { CoreModule } from './common/core.module.js';
import { encryptSecret, hashPassword, randomToken } from './common/auth/crypto.js';
import { PrismaService } from './common/prisma.service.js';
import { IngestService } from './modules/odds-management/ingest.service.js';
import { OddsManagementModule } from './modules/odds-management/odds-management.module.js';

@Module({ imports: [CoreModule, OddsManagementModule] })
class SeedModule {}

const ADMINS: { email: string; name: string; role: AdminRole }[] = [
  { email: 'super@goalbet.local', name: 'Super Admin', role: 'SUPER_ADMIN' },
  { email: 'operator@goalbet.local', name: 'Operator', role: 'OPERATOR' },
  { email: 'finance@goalbet.local', name: 'Finance', role: 'FINANCE' },
  // Second finance admin so large credits can be approved by someone else (F3.3).
  { email: 'finance2@goalbet.local', name: 'Finance 2', role: 'FINANCE' },
];

const PLAYERS = [
  { email: 'player1@goalbet.local', name: 'Ana Popescu', phone: '+40711000001' },
  { email: 'player2@goalbet.local', name: 'Mihai Ionescu', phone: '+40711000002' },
  { email: 'player3@goalbet.local', name: 'Elena Marin', phone: '+40711000003' },
];
const PLAYER_PASSWORD = 'Parola1234';

/**
 * `pnpm db:seed` — one admin per role (credentials + TOTP secrets printed and written to the
 * gitignored seed-credentials.txt), 3 players with 0 RON, default settings, mock fixtures for the
 * next 7 days and the matches that are live right now.
 */
async function main() {
  const env = loadEnv();
  const app = await NestFactory.createApplicationContext(SeedModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const ingest = app.get(IngestService);
  const lines: string[] = [`# ${brandName} seed credentials — generated ${new Date().toISOString()}`, ''];

  lines.push('## Admins (http://localhost:3001) — email / password / TOTP secret');
  for (const a of ADMINS) {
    const password = randomToken(9);
    const secret = generateSecret();
    const data = {
      name: a.name,
      role: a.role,
      passwordHash: await hashPassword(password),
      totpSecret: encryptSecret(secret, env.JWT_ADMIN_SECRET),
      totpEnabled: true,
      totpLastStep: null,
      failedLogins: 0,
      lockedUntil: null,
      status: 'ACTIVE' as const,
    };
    await prisma.adminUser.upsert({ where: { email: a.email }, create: { email: a.email, ...data }, update: data });
    const uri = generateURI({ issuer: `${brandName} Admin`, label: a.email, secret });
    lines.push(`${a.role.padEnd(12)} ${a.email}  ${password}  ${secret}`, `             ${uri}`);
  }

  lines.push('', `## Players (http://localhost:3000) — password for all: ${PLAYER_PASSWORD}`);
  const playerHash = await hashPassword(PLAYER_PASSWORD);
  for (const p of PLAYERS) {
    const existing = await prisma.user.findUnique({ where: { email: p.email } });
    if (!existing) {
      await prisma.user.create({
        data: {
          ...p,
          passwordHash: playerHash,
          dateOfBirth: new Date('1990-01-15T00:00:00Z'),
          termsAcceptedAt: new Date(),
          wallet: { create: {} },
        },
      });
    }
    lines.push(`${p.email}  (${existing ? 'existing' : 'created, 0 RON'})`);
  }

  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: {},
    });
  }

  const comps = await ingest.syncCompetitions();
  const now = Date.now();
  const eventIds = await ingest.syncFixtures(new Date(now - 4 * 3600_000), new Date(now + 7 * 24 * 3600_000));
  await ingest.syncLive();
  const soon = await ingest.refreshPrematch(48 * 3600_000);
  const live = await prisma.event.count({ where: { status: 'LIVE' } });

  lines.push(
    '',
    `## Sportsbook: ${comps} competitions, ${eventIds.length} open fixtures (7 days), markets for ${soon.events} pre-match events in the next 48 h, ${live} live now.`,
    'The worker keeps ingesting markets, live scores and odds after this.',
  );

  const out = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../seed-credentials.txt');
  writeFileSync(out, `${lines.join('\n')}\n`, { mode: 0o600 });
  console.log(lines.join('\n'));
  console.log(`\nSaved to ${out} (gitignored).`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
