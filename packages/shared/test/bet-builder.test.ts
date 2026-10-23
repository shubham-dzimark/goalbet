import { describe, expect, it } from 'vitest';
import { type BuilderSelection, fallbackBuilderOdds, validateBuilder } from '../src/bet-builder.js';
import type { MarketSpec } from '../src/markets.js';

const sel = (
  market: Partial<MarketSpec> & Pick<MarketSpec, 'type'>,
  outcome: string,
  extra: Partial<BuilderSelection> = {},
): BuilderSelection => ({
  market: { period: 'FT', line: null, team: null, playerRef: null, ...market },
  outcome,
  oddsMilli: 2000,
  ...extra,
});

describe('bet builder fallback pricing (F1.11)', () => {
  it('product × 0.85 correlation factor', () => {
    expect(fallbackBuilderOdds([2000, 2000, 1500])).toBe(5100); // 6.00 × 0.85
    expect(fallbackBuilderOdds([2000, 2000], 9000)).toBe(3600);
  });

  it('never below 1.01', () => {
    expect(fallbackBuilderOdds([1010, 1010])).toBe(1010); // 1.0201 × .85 = 0.867 → 1.01
  });
});

describe('bet builder contradiction rules', () => {
  it('accepts compatible selections', () => {
    expect(
      validateBuilder([
        sel({ type: 'MATCH_RESULT' }, 'HOME'),
        sel({ type: 'TOTAL_GOALS', line: 250 }, 'OVER'),
        sel({ type: 'BTTS' }, 'YES'),
      ]),
    ).toBeNull();
  });

  it('requires 2–12 selections', () => {
    expect(validateBuilder([sel({ type: 'MATCH_RESULT' }, 'HOME')])).toBe('TOO_FEW');
    const many = Array.from({ length: 13 }, (_, i) => sel({ type: 'TOTAL_CORNERS', line: 50 + i * 100 }, 'OVER'));
    expect(validateBuilder(many)).toBe('TOO_MANY');
  });

  it('blocks two selections from the same market', () => {
    expect(validateBuilder([sel({ type: 'MATCH_RESULT' }, 'HOME'), sel({ type: 'MATCH_RESULT' }, 'AWAY')])).toBe(
      'SAME_MARKET',
    );
  });

  it('blocks asian handicap', () => {
    expect(
      validateBuilder([sel({ type: 'ASIAN_HANDICAP', line: -50 }, 'HOME'), sel({ type: 'BTTS' }, 'YES')]),
    ).toBe('UNSUPPORTED_MARKET');
  });

  it.each([
    ['home win + correct score 0-1', [sel({ type: 'MATCH_RESULT' }, 'HOME'), sel({ type: 'CORRECT_SCORE' }, '0-1')]],
    ['under 1.5 + BTTS yes', [sel({ type: 'TOTAL_GOALS', line: 150 }, 'UNDER'), sel({ type: 'BTTS' }, 'YES')]],
    [
      'over 3.5 + under 2.5 corners-style goals',
      [sel({ type: 'TOTAL_GOALS', line: 350 }, 'OVER'), sel({ type: 'TEAM_TOTAL_GOALS', team: 'HOME', line: 50 }, 'UNDER'), sel({ type: 'TEAM_TOTAL_GOALS', team: 'AWAY', line: 250 }, 'UNDER')],
    ],
    [
      'corners over 10.5 + under 9.5',
      [
        sel({ type: 'TOTAL_CORNERS', line: 1050 }, 'OVER'),
        sel({ type: 'TOTAL_CORNERS', line: 950 }, 'UNDER'),
      ],
    ],
    [
      'home scorer + home team under 0.5',
      [
        sel({ type: 'ANYTIME_SCORER' }, 'p1', { playerTeam: 'HOME' }),
        sel({ type: 'TEAM_TOTAL_GOALS', team: 'HOME', line: 50 }, 'UNDER'),
      ],
    ],
    [
      'scorer + player under 0.5 shots',
      [
        sel({ type: 'ANYTIME_SCORER' }, 'p1', { playerTeam: 'HOME' }),
        sel({ type: 'PLAYER_SHOTS', playerRef: 'p1', line: 50 }, 'UNDER'),
      ],
    ],
    [
      'HT home win + FT 0-0',
      [sel({ type: 'MATCH_RESULT', period: 'H1' }, 'HOME'), sel({ type: 'CORRECT_SCORE' }, '0-0')],
    ],
    ['BTTS no + correct score 1-1', [sel({ type: 'BTTS' }, 'NO'), sel({ type: 'CORRECT_SCORE' }, '1-1')]],
  ])('blocks contradiction: %s', (_name, sels) => {
    expect(validateBuilder(sels)).toBe('CONTRADICTION');
  });

  it('allows several scorers, but two home scorers need ≥ 2 home goals', () => {
    const scorers = [
      sel({ type: 'ANYTIME_SCORER' }, 'p1', { playerTeam: 'HOME' }),
      sel({ type: 'ANYTIME_SCORER' }, 'p2', { playerTeam: 'HOME' }),
    ];
    expect(validateBuilder(scorers)).toBeNull();
    expect(validateBuilder([...scorers, sel({ type: 'TEAM_TOTAL_GOALS', team: 'HOME', line: 150 }, 'UNDER')])).toBe(
      'CONTRADICTION',
    );
    expect(validateBuilder([scorers[0]!, scorers[0]!])).toBe('SAME_MARKET');
  });
});
