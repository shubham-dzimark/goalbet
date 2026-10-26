import { describe, expect, it } from 'vitest';
import { isValidIban, normaliseIban, paymentRequestCreateSchema } from '../src/index.js';

describe('IBAN check (withdrawal payout details)', () => {
  it('accepts valid IBANs, with or without spaces and in any case', () => {
    expect(isValidIban('RO49AAAA1B31007593840000')).toBe(true);
    expect(isValidIban('ro49 aaaa 1b31 0075 9384 0000')).toBe(true);
    expect(isValidIban('DE89370400440532013000')).toBe(true);
    expect(isValidIban('GB29NWBK60161331926819')).toBe(true);
  });

  it('rejects typos, wrong length and garbage', () => {
    expect(isValidIban('RO49AAAA1B31007593840001')).toBe(false); // checksum
    expect(isValidIban('RO49AAAA1B3100759384000')).toBe(false); // RO must be 24 chars
    expect(isValidIban('DE89370400440532013001')).toBe(false);
    expect(isValidIban('not an iban')).toBe(false);
    expect(isValidIban('')).toBe(false);
  });

  it('normalises for storage', () => {
    expect(normaliseIban(' ro49 aaaa 1b31 ')).toBe('RO49AAAA1B31');
  });
});

describe('payment request schema', () => {
  it('bank withdrawals need a valid IBAN and holder; cash withdrawals and deposits do not', () => {
    const bad = paymentRequestCreateSchema.safeParse({ type: 'WITHDRAWAL', method: 'BANK_TRANSFER', amountBani: 5_000, iban: 'RO00', accountHolder: '' });
    expect(bad.success).toBe(false);
    const fields = bad.success ? [] : bad.error.issues.map((i) => i.path.join('.'));
    expect(fields).toEqual(expect.arrayContaining(['iban', 'accountHolder']));
    expect(paymentRequestCreateSchema.safeParse({ type: 'WITHDRAWAL', method: 'BANK_TRANSFER', amountBani: 5_000, iban: 'RO49 AAAA 1B31 0075 9384 0000', accountHolder: 'Ana Popescu' }).success).toBe(true);
    expect(paymentRequestCreateSchema.safeParse({ type: 'WITHDRAWAL', method: 'CASH_AT_SHOP', amountBani: 5_000 }).success).toBe(true);
    expect(paymentRequestCreateSchema.safeParse({ type: 'DEPOSIT', method: 'BANK_TRANSFER', amountBani: 5_000 }).success).toBe(true);
    expect(paymentRequestCreateSchema.safeParse({ type: 'DEPOSIT', method: 'BANK_TRANSFER', amountBani: 0 }).success).toBe(false);
  });
});
