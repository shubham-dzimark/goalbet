import type { Locale } from './enums.js';

/**
 * Money is always an integer number of bani (1 RON = 100 bani).
 * Floats never touch money: parsing and formatting are string-based.
 */
export type Bani = number;

export const BANI_PER_RON = 100;

export class MoneyError extends Error {}

export function assertBani(value: number, label = 'amount'): asserts value is Bani {
  if (!Number.isSafeInteger(value)) throw new MoneyError(`${label} must be an integer number of bani`);
}

/** Whole RON to bani (e.g. quick stakes). */
export function ronToBani(ron: number): Bani {
  if (!Number.isSafeInteger(ron)) throw new MoneyError('ronToBani expects whole RON');
  return ron * BANI_PER_RON;
}

/**
 * Parse user input such as "10", "10,5", "10.50", "1.234,56" or "1,234.56" into bani.
 * The last "," or "." followed by 1–2 digits is the decimal separator; any other
 * separators are treated as grouping. Returns null for invalid input or more than 2 decimals.
 */
export function parseRonToBani(input: string): Bani | null {
  const s = input.trim().replace(/\s|RON/gi, '');
  if (!/^\d[\d.,]*$/.test(s) && !/^[.,]\d{1,2}$/.test(s)) return null;
  const m = /^(.*?)(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const intPart = (m[1] ?? '').replace(/[.,]/g, '');
  const frac = m[2] ?? '';
  // A trailing group like "1.234" (3 digits after the separator) is grouping, not decimals.
  if (!/^\d*$/.test(intPart)) return null;
  const whole = intPart === '' ? 0 : Number(intPart);
  if (!Number.isSafeInteger(whole)) return null;
  const fracBani = frac === '' ? 0 : Number(frac.padEnd(2, '0'));
  const bani = whole * BANI_PER_RON + fracBani;
  return Number.isSafeInteger(bani) ? bani : null;
}

const SEPARATORS: Record<Locale, { group: string; decimal: string }> = {
  ro: { group: '.', decimal: ',' },
  en: { group: ',', decimal: '.' },
};

/** Format bani as "1.234,56" (ro) or "1,234.56" (en), without currency. */
export function formatBaniAmount(bani: Bani, locale: Locale): string {
  assertBani(bani);
  const { group, decimal } = SEPARATORS[locale];
  const negative = bani < 0;
  const abs = Math.abs(bani);
  const whole = Math.floor(abs / BANI_PER_RON).toString();
  const frac = (abs % BANI_PER_RON).toString().padStart(2, '0');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${negative ? '-' : ''}${grouped}${decimal}${frac}`;
}

/** Format bani with the RON suffix: "1.234,56 RON" (ro) / "1,234.56 RON" (en). */
export function formatRon(bani: Bani, locale: Locale): string {
  return `${formatBaniAmount(bani, locale)} RON`;
}

/** Apply basis points to an amount, rounding down to the ban. */
export function applyBps(bani: Bani, bps: number): Bani {
  assertBani(bani);
  if (!Number.isSafeInteger(bps)) throw new MoneyError('bps must be an integer');
  return Number((BigInt(bani) * BigInt(bps)) / 10_000n);
}
