import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ageOn, normalizePhone, registerSchema } from '../src/schemas/auth.js';
import { keyParity } from '../src/i18n-keys.js';
import { ERROR_CODES } from '../src/errors.js';
import { MARKET_TYPES } from '../src/enums.js';

const load = (l: string) => JSON.parse(readFileSync(new URL(`../i18n/${l}.json`, import.meta.url), 'utf8'));

describe('register schema (F1.3)', () => {
  const valid = {
    name: 'Ion Popescu',
    email: 'Ion@Example.com ',
    phone: '0712 345 678',
    password: 'parola123',
    dateOfBirth: '1990-05-01',
    acceptTerms: true,
  };

  it('accepts and normalises a valid registration', () => {
    const r = registerSchema.parse(valid);
    expect(r.email).toBe('ion@example.com');
    expect(r.phone).toBe('+40712345678');
  });

  it.each([
    ['email', { email: 'nope' }, 'validation.email'],
    ['phone', { phone: '123' }, 'validation.phone'],
    ['password', { password: 'short1' }, 'validation.passwordLength'],
    ['password digit', { password: 'onlyletters' }, 'validation.passwordDigit'],
    ['underage', { dateOfBirth: `${new Date().getUTCFullYear() - 17}-01-01` }, 'validation.underage'],
    ['terms', { acceptTerms: false }, 'validation.terms'],
  ])('rejects bad %s', (_n, patch, msg) => {
    const r = registerSchema.safeParse({ ...valid, ...patch });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain(msg);
  });

  it('computes age on birthday boundaries', () => {
    expect(ageOn('2000-06-15', new Date('2018-06-14T12:00:00Z'))).toBe(17);
    expect(ageOn('2000-06-15', new Date('2018-06-15T12:00:00Z'))).toBe(18);
  });

  it('normalises phone formats', () => {
    expect(normalizePhone('+40 712 345 678')).toBe('+40712345678');
    expect(normalizePhone('0040712345678')).toBe('+40712345678');
    expect(normalizePhone('07123')).toBeNull();
  });
});

describe('shared i18n (F0.3 / F5.7)', () => {
  const ro = load('ro');
  const en = load('en');

  it('ro and en have identical keys', () => {
    expect(keyParity(ro, en)).toEqual({ missingInA: [], missingInB: [] });
  });

  it('every error code and market type has a message', () => {
    for (const code of ERROR_CODES) expect(en.errors[code], code).toBeTypeOf('string');
    for (const t of MARKET_TYPES) expect(ro.markets[t], t).toBeTypeOf('string');
  });
});
