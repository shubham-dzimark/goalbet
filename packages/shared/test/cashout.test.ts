import { describe, expect, it } from 'vitest';
import { isCashOutWithinTolerance, quoteCashOut } from '../src/cashout.js';

const base = { stakeBani: 1000, potentialWinBani: 4000, marginBps: 500 };

describe('cash-out formula (F2.3)', () => {
  it('offer = stake × placed/current × (1 − margin) for open legs', () => {
    // placed 2.00, now 1.60: 10 × 2/1.6 × 0.95 = 11.875 -> 11.87
    const q = quoteCashOut({
      ...base,
      legs: [{ placedOddsMilli: 2000, currentOddsMilli: 1600, status: 'PENDING', suspended: false }],
    });
    expect(q).toEqual({ available: true, offerBani: 1187 });
  });

  it('offer drops when current odds lengthen', () => {
    const q = quoteCashOut({
      ...base,
      legs: [{ placedOddsMilli: 2000, currentOddsMilli: 4000, status: 'PENDING', suspended: false }],
    });
    expect(q).toEqual({ available: true, offerBani: 475 });
  });

  it('won legs lock in their placed odds', () => {
    // leg1 won @2.00, leg2 placed 2.00 now 1.25: 10 × (2 × 2)/1.25 × 0.95 = 30.40
    const q = quoteCashOut({
      ...base,
      legs: [
        { placedOddsMilli: 2000, currentOddsMilli: null, status: 'WON', suspended: false },
        { placedOddsMilli: 2000, currentOddsMilli: 1250, status: 'PENDING', suspended: false },
      ],
    });
    expect(q).toEqual({ available: true, offerBani: 3040 });
  });

  it('void legs are ignored', () => {
    const q = quoteCashOut({
      ...base,
      legs: [
        { placedOddsMilli: 3000, currentOddsMilli: null, status: 'VOID', suspended: false },
        { placedOddsMilli: 2000, currentOddsMilli: 2000, status: 'PENDING', suspended: false },
      ],
    });
    expect(q).toEqual({ available: true, offerBani: 950 });
  });

  it('is capped at potential winnings', () => {
    const q = quoteCashOut({
      ...base,
      potentialWinBani: 2000,
      legs: [{ placedOddsMilli: 3000, currentOddsMilli: 1001, status: 'PENDING', suspended: false }],
    });
    expect(q).toEqual({ available: true, offerBani: 2000 });
  });

  it('is unavailable when a leg lost, a market is suspended or there is no price', () => {
    expect(
      quoteCashOut({ ...base, legs: [{ placedOddsMilli: 2000, currentOddsMilli: 1500, status: 'LOST', suspended: false }] }),
    ).toEqual({ available: false, reason: 'LEG_LOST' });
    expect(
      quoteCashOut({ ...base, legs: [{ placedOddsMilli: 2000, currentOddsMilli: 1500, status: 'PENDING', suspended: true }] }),
    ).toEqual({ available: false, reason: 'MARKET_SUSPENDED' });
    expect(
      quoteCashOut({ ...base, legs: [{ placedOddsMilli: 2000, currentOddsMilli: null, status: 'PENDING', suspended: false }] }),
    ).toEqual({ available: false, reason: 'NO_PRICE' });
  });

  it('accepts a fresh offer within 1 % of the shown one (F2.6)', () => {
    expect(isCashOutWithinTolerance(1000, 990)).toBe(true);
    expect(isCashOutWithinTolerance(1000, 989)).toBe(false);
    expect(isCashOutWithinTolerance(1000, 1200)).toBe(true);
  });
});
