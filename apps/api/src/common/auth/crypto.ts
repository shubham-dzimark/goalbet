import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/** @node-rs/argon2 `Algorithm.Argon2id` (a const enum, which isolatedModules cannot import). */
const ARGON2ID = 2;

/** Argon2id with OWASP-recommended parameters (19 MiB, t=2, p=1). */
const ARGON = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/** Verify against a throwaway hash when the account does not exist, so timing does not reveal it. */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomToken());
  await verifyPassword(await dummyHash, password);
  return false;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** AES-256-GCM for secrets at rest (admin TOTP secrets). Output: iv.tag.ciphertext (base64url). */
export function encryptSecret(plain: string, keyMaterial: string): string {
  const key = createHash('sha256').update(`totp:${keyMaterial}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(sealed: string, keyMaterial: string): string {
  const [iv, tag, enc] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !enc) throw new Error('bad sealed secret');
  const key = createHash('sha256').update(`totp:${keyMaterial}`).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** 10-character ticket code without ambiguous characters (0/O, 1/I/L). */
export function ticketCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
