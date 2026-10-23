import { type Bani, assertBani } from './money.js';
import { type OddsMilli, ODDS_SCALE } from './odds.js';
import type { LegStatus } from './enums.js';

export interface CashOutLeg {
  placedOddsMilli: OddsMilli;
  /** Latest odds for the leg's selection(s); null when there is no price. */
  currentOddsMilli: OddsMilli | null;
  status: LegStatus;
  /** Event or market suspended right now. */
  suspended: boolean;
}

export type CashOutUnavailableReason = 'LEG_LOST' | 'MARKET_SUSPENDED' | 'NO_PRICE' | 'NO_VALUE';

export type CashOutQuote =
  | { available: true; offerBani: Bani }
  | { available: false; reason: CashOutUnavailableReason };

export const DEFAULT_CASHOUT_MARGIN_BPS = 500;
/** F2.6: a re-computed offer may be at most 1 % below the shown amount. */
export const CASHOUT_TOLERANCE_BPS = 100;

/**
 * Fallback cash-out formula (F2.3) when the provider has no cash-out data:
 *   offer = stake × (placedTotalOdds ÷ currentTotalOdds) × (1 − margin)
 * Settled legs are locked in: they keep their (effective) placed odds in the numerator and
 * count as 1.00 in the denominator. Open legs use placed odds over current odds.
 * The offer never exceeds the potential winnings.
 */
export function quoteCashOut(input: {
  stakeBani: Bani;
  potentialWinBani: Bani;
  legs: readonly CashOutLeg[];
  marginBps: number;
}): CashOutQuote {
  const { stakeBani, potentialWinBani, legs, marginBps } = input;
  assertBani(stakeBani, 'stake');
  if (marginBps < 0 || marginBps >= 10_000) throw new Error('margin out of range');

  if (legs.some((l) => l.status === 'LOST')) return { available: false, reason: 'LEG_LOST' };

  const s = BigInt(ODDS_SCALE);
  let num = 1n;
  let den = 1n;
  for (const leg of legs) {
    const placed = BigInt(leg.placedOddsMilli);
    switch (leg.status) {
      case 'WON':
        num *= placed;
        den *= s;
        break;
      case 'HALF_WON':
        num *= placed + s;
        den *= 2n * s;
        break;
      case 'HALF_LOST':
        num *= 1n;
        den *= 2n;
        break;
      case 'VOID':
        break;
      case 'PENDING': {
        if (leg.suspended) return { available: false, reason: 'MARKET_SUSPENDED' };
        if (leg.currentOddsMilli === null) return { available: false, reason: 'NO_PRICE' };
        num *= placed;
        den *= BigInt(leg.currentOddsMilli);
        break;
      }
    }
  }

  const raw = (BigInt(stakeBani) * num * BigInt(10_000 - marginBps)) / (den * 10_000n);
  const offerBani = Math.min(Number(raw), potentialWinBani);
  if (offerBani < 1) return { available: false, reason: 'NO_VALUE' };
  return { available: true, offerBani };
}

/** F2.6: true when the fresh offer is not more than the tolerance below what the user saw. */
export function isCashOutWithinTolerance(
  shownBani: Bani,
  latestBani: Bani,
  toleranceBps = CASHOUT_TOLERANCE_BPS,
): boolean {
  return BigInt(latestBani) * 10_000n >= BigInt(shownBani) * BigInt(10_000 - toleranceBps);
}
