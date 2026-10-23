import { describe, expect, it } from 'vitest';
import { applyBps, formatBaniAmount, formatRon, parseRonToBani, ronToBani } from '../src/money.js';

describe('money (bani)', () => {
  it('formats RO as 1.234,56 RON and EN as 1,234.56 RON', () => {
    expect(formatRon(123456, 'ro')).toBe('1.234,56 RON');
    expect(formatRon(123456, 'en')).toBe('1,234.56 RON');
    expect(formatRon(9000, 'ro')).toBe('90,00 RON');
    expect(formatRon(5, 'en')).toBe('0.05 RON');
    expect(formatBaniAmount(-123456789, 'ro')).toBe('-1.234.567,89');
  });

  it('rejects non-integer bani', () => {
    expect(() => formatRon(1.5, 'ro')).toThrow();
  });

  it('parses user input in both locales without floats', () => {
    expect(parseRonToBani('10')).toBe(1000);
    expect(parseRonToBani('10,5')).toBe(1050);
    expect(parseRonToBani('10.50')).toBe(1050);
    expect(parseRonToBani('1.234,56')).toBe(123456);
    expect(parseRonToBani('1,234.56')).toBe(123456);
    expect(parseRonToBani('1.234')).toBe(123400);
    expect(parseRonToBani('0,01')).toBe(1);
    expect(parseRonToBani(' 20 RON ')).toBe(2000);
    expect(parseRonToBani('abc')).toBeNull();
    expect(parseRonToBani('-5')).toBeNull();
    expect(parseRonToBani('')).toBeNull();
  });

  it('converts RON and applies basis points rounding down', () => {
    expect(ronToBani(100)).toBe(10000);
    expect(applyBps(1001, 500)).toBe(50);
    expect(() => ronToBani(1.5)).toThrow();
  });
});
