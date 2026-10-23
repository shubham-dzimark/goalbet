import { type Bani, assertBani } from './money.js';
import { type OddsMilli, ODDS_SCALE, assertOdds, roundHalfUp } from './odds.js';
import type { LegStatus } from './enums.js';

/** Potential winnings at placement: floor(stake × totalOdds). (F1.12, F2.10) */
export function potentialWin(stakeBani: Bani, totalOddsMilli: OddsMilli): Bani {
  assertBani(stakeBani, 'stake');
  assertOdds(totalOddsMilli);
  return Number((BigInt(stakeBani) * BigInt(totalOddsMilli)) / BigInt(ODDS_SCALE));
}

export interface SettledLeg {
  oddsMilli: OddsMilli;
  status: LegStatus;
}

/**
 * Effective odds of a settled leg as an exact ratio (F2.10):
 *  WON = odds · VOID = 1.00 · HALF_WON = (odds + 1) / 2 · HALF_LOST = 0.5 · LOST = 0
 */
export function effectiveLegOdds(leg: SettledLeg): { num: bigint; den: bigint } {
  const o = BigInt(leg.oddsMilli);
  const s = BigInt(ODDS_SCALE);
  switch (leg.status) {
    case 'WON':
      return { num: o, den: s };
    case 'VOID':
      return { num: s, den: s };
    case 'HALF_WON':
      return { num: o + s, den: 2n * s };
    case 'HALF_LOST':
      return { num: 1n, den: 2n };
    case 'LOST':
      return { num: 0n, den: 1n };
    case 'PENDING':
      throw new Error('Cannot compute payout for a pending leg');
  }
}

export type TicketOutcome = 'WON' | 'LOST' | 'VOID';

export interface SettlementPayout {
  outcome: TicketOutcome;
  /** Effective total odds after voids/half results, rounded half-up to 3 decimals. 0 when lost. */
  effectiveOddsMilli: number;
  payoutBani: Bani;
}

/**
 * Payout for a fully settled ticket: stake × product of effective leg odds (F2.10).
 * - any LOST leg -> LOST, payout 0
 * - every leg VOID -> VOID, stake refunded
 * - otherwise WON with floor(stake × effectiveOdds)
 */
export function settleTicketPayout(stakeBani: Bani, legs: readonly SettledLeg[]): SettlementPayout {
  assertBani(stakeBani, 'stake');
  if (legs.length === 0) throw new Error('ticket has no legs');
  if (legs.some((l) => l.status === 'LOST')) return { outcome: 'LOST', effectiveOddsMilli: 0, payoutBani: 0 };
  if (legs.every((l) => l.status === 'VOID'))
    return { outcome: 'VOID', effectiveOddsMilli: ODDS_SCALE, payoutBani: stakeBani };

  let num = 1n;
  let den = 1n;
  for (const leg of legs) {
    const f = effectiveLegOdds(leg);
    num *= f.num;
    den *= f.den;
  }
  const effectiveOddsMilli = Number(roundHalfUp(num * BigInt(ODDS_SCALE), den));
  const payoutBani = Number((BigInt(stakeBani) * BigInt(effectiveOddsMilli)) / BigInt(ODDS_SCALE));
  return { outcome: 'WON', effectiveOddsMilli, payoutBani };
}
