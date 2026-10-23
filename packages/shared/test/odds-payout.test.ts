import { describe, expect, it } from 'vitest';
import { combineOdds, formatOdds, oddsToDecimalString, parseOddsMilli } from '../src/odds.js';
import { potentialWin, settleTicketPayout } from '../src/payout.js';

describe('odds', () => {
  it('parses and prints Decimal(8,3) odds', () => {
    expect(parseOddsMilli('1.85')).toBe(1850);
    expect(parseOddsMilli('1.850')).toBe(1850);
    expect(parseOddsMilli('12')).toBe(12000);
    expect(parseOddsMilli({ toString: () => '2.375' })).toBe(2375);
    expect(oddsToDecimalString(1850)).toBe('1.850');
    expect(() => parseOddsMilli('x')).toThrow();
  });

  it('formats with locale separator', () => {
    expect(formatOdds(1850, 'ro')).toBe('1,85');
    expect(formatOdds(1875, 'en')).toBe('1.875');
    expect(formatOdds(2000, 'en')).toBe('2.00');
  });

  it('combines accumulator odds rounding half-up to 3 decimals', () => {
    expect(combineOdds([1850])).toBe(1850);
    expect(combineOdds([1850, 2100])).toBe(3885);
    // 1.333 × 1.333 = 1.776889 -> 1.777
    expect(combineOdds([1333, 1333])).toBe(1777);
    // 1.5 × 1.001 = 1.5015 -> half-up 1.502
    expect(combineOdds([1500, 1001])).toBe(1502);
    expect(() => combineOdds([])).toThrow();
  });
});

describe('payout (F2.10)', () => {
  it('potential win = floor(stake × total odds)', () => {
    expect(potentialWin(1000, 3885)).toBe(3885);
    expect(potentialWin(333, 1777)).toBe(591); // 591.741 -> 591
  });

  it('pays stake × product of effective odds', () => {
    const r = settleTicketPayout(1000, [
      { oddsMilli: 1850, status: 'WON' },
      { oddsMilli: 2100, status: 'WON' },
    ]);
    expect(r).toEqual({ outcome: 'WON', effectiveOddsMilli: 3885, payoutBani: 3885 });
  });

  it('settled payout equals potential win when every leg wins', () => {
    const legs = [1333, 1333, 1777, 2050];
    const total = combineOdds(legs);
    const r = settleTicketPayout(2500, legs.map((o) => ({ oddsMilli: o, status: 'WON' as const })));
    expect(r.payoutBani).toBe(potentialWin(2500, total));
  });

  it('void leg counts as 1.00', () => {
    const r = settleTicketPayout(1000, [
      { oddsMilli: 1850, status: 'WON' },
      { oddsMilli: 2100, status: 'VOID' },
    ]);
    expect(r.payoutBani).toBe(1850);
  });

  it('all void refunds the stake', () => {
    const r = settleTicketPayout(1000, [{ oddsMilli: 1850, status: 'VOID' }]);
    expect(r).toEqual({ outcome: 'VOID', effectiveOddsMilli: 1000, payoutBani: 1000 });
  });

  it('any lost leg loses the ticket', () => {
    const r = settleTicketPayout(1000, [
      { oddsMilli: 1850, status: 'WON' },
      { oddsMilli: 2100, status: 'LOST' },
    ]);
    expect(r).toEqual({ outcome: 'LOST', effectiveOddsMilli: 0, payoutBani: 0 });
  });

  it('half-won uses (odds + 1) / 2 and half-lost uses 0.5', () => {
    expect(settleTicketPayout(1000, [{ oddsMilli: 1900, status: 'HALF_WON' }]).payoutBani).toBe(1450);
    expect(settleTicketPayout(1000, [{ oddsMilli: 1900, status: 'HALF_LOST' }]).payoutBani).toBe(500);
    expect(
      settleTicketPayout(1000, [
        { oddsMilli: 1900, status: 'HALF_WON' },
        { oddsMilli: 2000, status: 'WON' },
      ]).payoutBani,
    ).toBe(2900);
  });

  it('rejects pending legs', () => {
    expect(() => settleTicketPayout(1000, [{ oddsMilli: 1900, status: 'PENDING' }])).toThrow();
  });
});
