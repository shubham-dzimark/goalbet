import { MARKET_GROUPS, marketGroupOf } from '@goalbet/shared';
import { describe, expect, it } from 'vitest';
import { MOCK_COMPETITIONS } from '../src/modules/api-integration/mock/data.js';
import { priceMarkets } from '../src/modules/api-integration/mock/pricing.js';
import {
  SLOT_MS,
  clock,
  finalOutcome,
  fixtureSeed,
  liveState,
  pricingState,
} from '../src/modules/api-integration/mock/simulation.js';

const HOUR = 3600_000;

describe('F4.1 MockProvider world', () => {
  it('seeds the seven competitions from the brief, football only', () => {
    expect(MOCK_COMPETITIONS.map((c) => c.name)).toEqual([
      'SuperLiga',
      'Premier League',
      'LaLiga',
      'Serie A',
      'Bundesliga',
      'Ligue 1',
      'Liga Campionilor',
    ]);
  });

  it('keeps 3–5 matches live at any moment', () => {
    const base = Date.UTC(2026, 9, 21, 12, 0, 0);
    for (let i = 0; i < 200; i++) {
      const now = base + Math.floor((i * 7 * 24 * HOUR) / 200) + i * 13_337;
      let live = 0;
      for (let slot = Math.floor((now - 4 * HOUR) / SLOT_MS); slot * SLOT_MS <= now; slot++) {
        if (liveState(fixtureSeed(slot), now).status === 'LIVE') live++;
      }
      expect(live, new Date(now).toISOString()).toBeGreaterThanOrEqual(3);
      expect(live).toBeLessThanOrEqual(5);
    }
  });

  it('runs a realistic match clock: halves, half time, stoppage, full time', () => {
    const s = fixtureSeed(900_000);
    const t0 = s.scheduledStart;
    expect(clock(s, t0 - 1).status).toBe('SCHEDULED');
    expect(clock(s, t0 + 10 * 60_000)).toMatchObject({ status: 'LIVE', period: 'FIRST_HALF', minute: 11 });
    expect(clock(s, t0 + (45 + s.st1 + 5) * 60_000).period).toBe('HALF_TIME');
    expect(clock(s, t0 + (45 + s.st1 + 15 + 10) * 60_000)).toMatchObject({ period: 'SECOND_HALF', minute: 56 });
    expect(clock(s, t0 + 200 * 60_000).status).toBe('FINISHED');
  });

  it('scores only grow during a match and the final result matches the last live score', () => {
    const s = fixtureSeed(900_123);
    let prev = { h: 0, a: 0, c: 0, k: 0 };
    for (let m = 0; m <= 130; m++) {
      const st = liveState(s, s.scheduledStart + m * 60_000);
      if (st.status === 'CANCELLED') return;
      expect(st.homeScore).toBeGreaterThanOrEqual(prev.h);
      expect(st.awayScore).toBeGreaterThanOrEqual(prev.a);
      expect(st.corners).toBeGreaterThanOrEqual(prev.c);
      expect(st.cards).toBeGreaterThanOrEqual(prev.k);
      prev = { h: st.homeScore, a: st.awayScore, c: st.corners, k: st.cards };
    }
    const result = finalOutcome(s, s.scheduledStart + 130 * 60_000)!;
    expect([result.ftHome, result.ftAway]).toEqual([prev.h, prev.a]);
    expect(result.htHome).toBeLessThanOrEqual(result.ftHome);
    const scorerGoals = Object.values(result.players).reduce((a, p) => a + p.goals, 0);
    expect(scorerGoals).toBe(result.ftHome + result.ftAway);
  });

  it('offers every market group of F1.9 pre-match with sane odds', () => {
    const s = fixtureSeed(900_200);
    const markets = priceMarkets(pricingState(s, s.scheduledStart - HOUR)!);
    const groups = new Set(markets.map((m) => marketGroupOf(m)));
    expect([...groups].sort()).toEqual([...MARKET_GROUPS].sort());
    const types = new Set(markets.map((m) => m.type));
    for (const t of ['MATCH_RESULT', 'DOUBLE_CHANCE', 'TOTAL_GOALS', 'TEAM_TOTAL_GOALS', 'BTTS', 'EUROPEAN_HANDICAP', 'ASIAN_HANDICAP', 'CORRECT_SCORE', 'TOTAL_CORNERS', 'TOTAL_CARDS', 'ANYTIME_SCORER', 'PLAYER_SHOTS'])
      expect(types.has(t as never), t).toBe(true);
    const goalLines = markets.filter((m) => m.type === 'TOTAL_GOALS' && m.period === 'FT').map((m) => m.line);
    expect(goalLines).toEqual([50, 150, 250, 350, 450, 550]);
    // 1X2 overround between 2 % and 10 %
    const x12 = markets.find((m) => m.type === 'MATCH_RESULT' && m.period === 'FT')!;
    const overround = x12.selections.reduce((a, sel) => a + 1000 / sel.oddsMilli!, 0);
    expect(overround).toBeGreaterThan(1.02);
    expect(overround).toBeLessThan(1.1);
  });

  it('drifts odds over time, suspends randomly and after goals, and has final results', () => {
    const s = fixtureSeed(900_300);
    const t = s.scheduledStart + 20 * 60_000;
    const a = priceMarkets(pricingState(s, t)!);
    const b = priceMarkets(pricingState(s, t + 60_000)!);
    const odds = (ms: typeof a) => ms.flatMap((m) => m.selections.map((x) => x.oddsMilli)).join(',');
    expect(odds(a)).not.toEqual(odds(b));

    let suspended = 0;
    for (let i = 0; i < 400; i++) if (liveState(fixtureSeed(900_000 + i), fixtureSeed(900_000 + i).scheduledStart + 30 * 60_000).suspended) suspended++;
    expect(suspended).toBeGreaterThan(0);
    expect(suspended).toBeLessThan(80);
  });

  it('applies test overrides: kickoff now, finish, final score, odds factor', () => {
    const s = fixtureSeed(900_400);
    const now = s.scheduledStart - 5 * HOUR;
    expect(liveState(s, now, { kickoffAt: now - 60_000 }).status).toBe('LIVE');
    const finished = finalOutcome(s, now, { kickoffAt: now - 30 * 60_000, finishAt: now - 1, finalScore: { home: 3, away: 1 } });
    expect(finished).toMatchObject({ ftHome: 3, ftAway: 1 });
    const base = priceMarkets(pricingState(s, now)!)[0]!.selections[0]!.oddsMilli!;
    const moved = priceMarkets(pricingState(s, now, { oddsFactorBps: 15_000 })!)[0]!.selections[0]!.oddsMilli!;
    expect(moved).toBeGreaterThan(base);
  });
});
