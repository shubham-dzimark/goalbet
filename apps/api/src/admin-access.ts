/* eslint-disable no-console -- command-line tool: prints a summary (never passwords) */
import 'reflect-metadata';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuditService, SYSTEM_ACTOR } from './common/audit.service.js';
import { SessionService } from './common/auth/session.service.js';
import { hashPassword, randomToken } from './common/auth/crypto.js';
import { CoreModule } from './common/core.module.js';
import { PrismaService } from './common/prisma.service.js';

@Module({ imports: [CoreModule] })
class AdminAccessModule {}

const USAGE = `Usage: pnpm --filter @goalbet/api admin:access [--email a@b.c ...] [--rotate-passwords]
  Unlinks the authenticator of the given admins (all admins when no --email), clears lockouts and
  ends their sessions, so their next login shows a new QR code to scan.
  --rotate-passwords also sets new random passwords.
  The Admins section of seed-credentials.txt is updated; passwords are never printed.`;

const CREDENTIALS_FILE = resolve(fileURLToPath(new URL('../../..', import.meta.url)), 'seed-credentials.txt');

/** Rewrites the "## Admins" section, keeping known passwords and replacing rotated ones. */
function updateCredentialsFile(admins: { email: string; role: string }[], rotated: Map<string, string>) {
  const old = existsSync(CREDENTIALS_FILE) ? readFileSync(CREDENTIALS_FILE, 'utf8') : '';
  const known = new Map<string, string>();
  for (const line of old.split('\n')) {
    const m = /^\S+\s+(\S+@\S+)\s+(\S+)/.exec(line);
    if (m) known.set(m[1]!, m[2]!);
  }
  const section = [
    '## Admins (http://localhost:3001) — email / password. First login shows a QR code for the authenticator app.',
    ...admins.map((a) => `${a.role.padEnd(12)} ${a.email}  ${rotated.get(a.email) ?? known.get(a.email) ?? '(password unchanged)'}`),
  ].join('\n');
  // replace the old section (header up to the next blank line) or append a new one
  const pattern = /## Admins[^\n]*\n(?:[^\n]+\n)*/;
  const next = pattern.test(old) ? old.replace(pattern, `${section}\n`) : `${old}${old.endsWith('\n') || !old ? '' : '\n'}\n${section}\n`;
  writeFileSync(CREDENTIALS_FILE, next);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) return console.log(USAGE);
  const emails = args.flatMap((a, i) => (args[i - 1] === '--email' ? [a.toLowerCase()] : []));
  const rotate = args.includes('--rotate-passwords');

  const app = await NestFactory.createApplicationContext(AdminAccessModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const audit = app.get(AuditService);
  const sessions = app.get(SessionService);

  const admins = await prisma.adminUser.findMany({
    where: emails.length ? { email: { in: emails } } : {},
    orderBy: [{ role: 'asc' }, { email: 'asc' }],
  });
  const missing = emails.filter((e) => !admins.some((a) => a.email === e));
  if (missing.length) console.warn(`no admin with email: ${missing.join(', ')}`);

  const rotated = new Map<string, string>();
  for (const admin of admins) {
    const password = rotate ? randomToken(9) : null;
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        totpSecret: null,
        totpEnabled: false,
        totpLastStep: null,
        failedLogins: 0,
        lockedUntil: null,
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      },
    });
    await sessions.revokeAll('ADMIN', admin.id);
    await audit.log({
      category: 'ADMIN',
      action: password ? 'ADMIN_2FA_AND_PASSWORD_RESET' : 'ADMIN_2FA_RESET',
      actor: SYSTEM_ACTOR,
      entityType: 'AdminUser',
      entityId: admin.id,
      meta: { via: 'cli' },
    });
    if (password) rotated.set(admin.email, password);
    console.log(`${admin.email}: authenticator unlinked${password ? ', new password' : ''}, sessions ended`);
  }

  const all = await prisma.adminUser.findMany({ orderBy: [{ role: 'asc' }, { email: 'asc' }], select: { email: true, role: true } });
  updateCredentialsFile(all, rotated);
  console.log(`updated ${CREDENTIALS_FILE}`);
  await app.close();
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
