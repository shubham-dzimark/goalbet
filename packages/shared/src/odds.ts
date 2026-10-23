import type { Locale } from './enums.js';

/**
 * Odds are decimal odds with 3 decimals (DB: Decimal(8,3)).
 * In maths they are integers in thousandths ("milli-odds"): 1.850 -> 1850.
 */
export type OddsMilli = number;

export const ODDS_SCALE = 1000;
export const MIN_ODDS_MILLI = 1001;

export class OddsError extends Error {}

/** Parse "1.85", "1.850" or a Prisma Decimal (via toString) into milli-odds. String based, no floats. */
export function parseOddsMilli(value: string | { toString(): string }): OddsMilli {
  const s = value.toString().trim();
  const m = /^(\d+)(?:\.(\d{1,3})\d*)?$/.exec(s);
  if (!m) throw new OddsError(`Invalid odds: ${s}`);
  const milli = Number(m[1]) * ODDS_SCALE + Number((m[2] ?? '').padEnd(3, '0'));
  return milli;
}

/** Milli-odds to a fixed 3-decimal string for DB writes ("1.850"). */
export function oddsToDecimalString(milli: OddsMilli): string {
  assertOdds(milli);
  return `${Math.floor(milli / ODDS_SCALE)}.${(milli % ODDS_SCALE).toString().padStart(3, '0')}`;
}

export function assertOdds(milli: number): asserts milli is OddsMilli {
  if (!Number.isSafeInteger(milli) || milli < ODDS_SCALE) throw new OddsError(`Invalid odds: ${milli}`);
}

/** Display odds with 2 decimals, or 3 when the third is significant. Locale decides the separator. */
export function formatOdds(milli: OddsMilli, locale: Locale): string {
  assertOdds(milli);
  const whole = Math.floor(milli / ODDS_SCALE);
  const frac3 = (milli % ODDS_SCALE).toString().padStart(3, '0');
  const frac = frac3.endsWith('0') ? frac3.slice(0, 2) : frac3;
  return `${whole}${locale === 'ro' ? ',' : '.'}${frac}`;
}

/** Round a BigInt ratio half-up. */
export function roundHalfUp(num: bigint, den: bigint): bigint {
  if (den <= 0n) throw new OddsError('denominator must be positive');
  if (num < 0n) throw new OddsError('numerator must be non-negative');
  return (num * 2n + den) / (den * 2n);
}

/**
 * Accumulator total odds: product of leg odds, rounded half-up to 3 decimals.
 * This rounded figure is what the ticket stores and pays on.
 */
export function combineOdds(legs: readonly OddsMilli[]): OddsMilli {
  if (legs.length === 0) throw new OddsError('at least one leg required');
  let num = 1n;
  let den = 1n;
  for (const o of legs) {
    assertOdds(o);
    num *= BigInt(o);
    den *= BigInt(ODDS_SCALE);
  }
  return Number(roundHalfUp(num * BigInt(ODDS_SCALE), den));
}

/** Implied probability in basis points (for exposure/reporting only). */
export function impliedProbabilityBps(milli: OddsMilli): number {
  assertOdds(milli);
  return Math.round((ODDS_SCALE * 10_000) / milli);
}
