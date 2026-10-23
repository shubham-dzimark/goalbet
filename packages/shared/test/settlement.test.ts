import { describe, expect, it } from 'vitest';
import type { MarketSpec } from '../src/markets.js';
import { type MatchOutcome, combineBuilderParts, settleAsianHandicap, settleSelection } from '../src/settlement.js';

const m = (p: Partial<MarketSpec> & Pick<MarketSpec, 'type'>): MarketSpec => ({
  period: 'FT',
  line: null,
  team: null,
  playerRef: null,
  ...p,
});

const outcome = (p: Partial<MatchOutcome> = {}): MatchOutcome => ({
  ftHome: 2,
  ftAway: 1,
  htHome: 0,
  htAway: 1,
  corners: 9,
  cards: 4,
  players: {
    p1: { appeared: true, goals: 1, shots: 3 },
    p2: { appeared: true, goals: 0, shots: 0 },
    p3: { appeared: false, goals: 0, shots: 0 },
  },
  ...p,
});

describe('settlement rules per market (F2.9)', () => {
  const r = outcome();

  it('1X2 full time and half time', () => {
    expect(settleSelection(m({ type: 'MATCH_RESULT' }), 'HOME', r)).toBe('WON');
    expect(settleSelection(m({ type: 'MATCH_RESULT' }), 'DRAW', r)).toBe('LOST');
    expect(settleSelection(m({ type: 'MATCH_RESULT', period: 'H1' }), 'AWAY', r)).toBe('WON');
  });

  it('double chance', () => {
    expect(settleSelection(m({ type: 'DOUBLE_CHANCE' }), 'HOME_DRAW', r)).toBe('WON');
    expect(settleSelection(m({ type: 'DOUBLE_CHANCE' }), 'HOME_AWAY', r)).toBe('WON');
    expect(settleSelection(m({ type: 'DOUBLE_CHANCE' }), 'DRAW_AWAY', r)).toBe('LOST');
  });

  it('total goals O/U 0.5 – 5.5 and integer push', () => {
    const tg = (line: number) => m({ type: 'TOTAL_GOALS', line });
    expect(settleSelection(tg(50), 'OVER', r)).toBe('WON');
    expect(settleSelection(tg(250), 'OVER', r)).toBe('WON');
    expect(settleSelection(tg(350), 'OVER', r)).toBe('LOST');
    expect(settleSelection(tg(550), 'UNDER', r)).toBe('WON');
    expect(settleSelection(tg(300), 'OVER', r)).toBe('VOID');
    expect(settleSelection(m({ type: 'TOTAL_GOALS', line: 50, period: 'H1' }), 'UNDER', r)).toBe('LOST');
  });

  it('team goals', () => {
    expect(settleSelection(m({ type: 'TEAM_TOTAL_GOALS', team: 'HOME', line: 150 }), 'OVER', r)).toBe('WON');
    expect(settleSelection(m({ type: 'TEAM_TOTAL_GOALS', team: 'AWAY', line: 150 }), 'OVER', r)).toBe('LOST');
  });

  it('both teams to score', () => {
    expect(settleSelection(m({ type: 'BTTS' }), 'YES', r)).toBe('WON');
    expect(settleSelection(m({ type: 'BTTS' }), 'NO', outcome({ ftAway: 0 }))).toBe('WON');
  });

  it('european handicap (3-way)', () => {
    const eh = (line: number) => m({ type: 'EUROPEAN_HANDICAP', line });
    expect(settleSelection(eh(-100), 'DRAW', r)).toBe('WON'); // 2-1 → 1-1
    expect(settleSelection(eh(-100), 'HOME', r)).toBe('LOST');
    expect(settleSelection(eh(100), 'HOME', r)).toBe('WON');
    expect(settleSelection(eh(-200), 'AWAY', r)).toBe('WON');
  });

  it('correct score incl. OTHER', () => {
    expect(settleSelection(m({ type: 'CORRECT_SCORE' }), '2-1', r)).toBe('WON');
    expect(settleSelection(m({ type: 'CORRECT_SCORE' }), '1-1', r)).toBe('LOST');
    expect(settleSelection(m({ type: 'CORRECT_SCORE' }), 'OTHER', outcome({ ftHome: 4 }))).toBe('WON');
    expect(settleSelection(m({ type: 'CORRECT_SCORE' }), 'OTHER', r)).toBe('LOST');
  });

  it('corners and cards', () => {
    expect(settleSelection(m({ type: 'TOTAL_CORNERS', line: 850 }), 'OVER', r)).toBe('WON');
    expect(settleSelection(m({ type: 'TOTAL_CORNERS', line: 950 }), 'UNDER', r)).toBe('WON');
    expect(settleSelection(m({ type: 'TOTAL_CARDS', line: 450 }), 'OVER', r)).toBe('LOST');
  });

  it('player markets: scorer and shots, void when player did not appear', () => {
    expect(settleSelection(m({ type: 'ANYTIME_SCORER' }), 'p1', r)).toBe('WON');
    expect(settleSelection(m({ type: 'ANYTIME_SCORER' }), 'p2', r)).toBe('LOST');
    expect(settleSelection(m({ type: 'ANYTIME_SCORER' }), 'p3', r)).toBe('VOID');
    expect(settleSelection(m({ type: 'PLAYER_SHOTS', playerRef: 'p1', line: 250 }), 'OVER', r)).toBe('WON');
    expect(settleSelection(m({ type: 'PLAYER_SHOTS', playerRef: 'p2', line: 50 }), 'UNDER', r)).toBe('WON');
    expect(settleSelection(m({ type: 'PLAYER_SHOTS', playerRef: 'p3', line: 50 }), 'OVER', r)).toBe('VOID');
  });

  it('cancelled match voids everything', () => {
    expect(settleSelection(m({ type: 'MATCH_RESULT' }), 'HOME', outcome({ cancelled: true }))).toBe('VOID');
  });
});

describe('asian handicap incl. quarter lines', () => {
  // [home, away, homeLine, outcome, expected]
  const cases: [number, number, number, 'HOME' | 'AWAY', string][] = [
    [1, 0, -50, 'HOME', 'WON'],
    [1, 1, -50, 'HOME', 'LOST'],
    [1, 1, 0, 'HOME', 'VOID'],
    [2, 1, -100, 'HOME', 'VOID'],
    [3, 1, -100, 'HOME', 'WON'],
    [1, 1, -25, 'HOME', 'HALF_LOST'], // 0 + -0.5
    [1, 1, 25, 'HOME', 'HALF_WON'], // 0 + +0.5
    [2, 1, -75, 'HOME', 'HALF_WON'], // -0.5 win, -1 push
    [1, 0, -125, 'HOME', 'HALF_LOST'], // -1 push, -1.5 lose
    [2, 0, -175, 'HOME', 'HALF_WON'], // -1.5 win, -2 push
    [1, 1, -25, 'AWAY', 'HALF_WON'], // away +0.25
    [2, 1, -75, 'AWAY', 'HALF_LOST'], // away +0.75
    [0, 2, 150, 'AWAY', 'WON'], // away -1.5
    [0, 1, 150, 'AWAY', 'LOST'],
  ];
  it.each(cases)('%i-%i line %i on %s → %s', (h, a, line, side, expected) => {
    expect(settleAsianHandicap(h, a, line, side)).toBe(expected);
  });

  it('via settleSelection', () => {
    expect(
      settleSelection(
        { type: 'ASIAN_HANDICAP', period: 'FT', line: -75, team: null, playerRef: null },
        'HOME',
        outcome(),
      ),
    ).toBe('HALF_WON'); // 2-1 with -0.75: -0.5 half wins, -1.0 half pushes
  });
});

describe('bet builder leg combination', () => {
  it('needs every part to win; any void voids the leg', () => {
    expect(combineBuilderParts(['WON', 'WON'])).toBe('WON');
    expect(combineBuilderParts(['WON', 'LOST'])).toBe('LOST');
    expect(combineBuilderParts(['WON', 'VOID'])).toBe('VOID');
    expect(combineBuilderParts(['VOID', 'LOST'])).toBe('LOST');
  });
});
