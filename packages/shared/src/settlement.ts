import type { SelectionResult } from './enums.js';
import type { LineCenti, MarketSpec } from './markets.js';

export interface PlayerStat {
  appeared: boolean;
  goals: number;
  shots: number;
}

/** Final facts about a match, as reported by the results provider (F2.9). */
export interface MatchOutcome {
  cancelled?: boolean;
  ftHome: number;
  ftAway: number;
  htHome: number;
  htAway: number;
  corners: number;
  cards: number;
  players: Record<string, PlayerStat>;
}

type Settled = Exclude<SelectionResult, 'PENDING'>;

/** -1 / 0 / +1 compare of a centi-scaled value against a centi line. */
function cmp(valueCenti: number, line: LineCenti): -1 | 0 | 1 {
  return valueCenti > line ? 1 : valueCenti < line ? -1 : 0;
}

function overUnder(value: number, line: LineCenti | null, outcome: string): Settled {
  if (line === null) throw new Error('over/under market needs a line');
  const c = cmp(value * 100, line);
  if (c === 0) return 'VOID';
  if (outcome === 'OVER') return c > 0 ? 'WON' : 'LOST';
  if (outcome === 'UNDER') return c < 0 ? 'WON' : 'LOST';
  throw new Error(`bad over/under outcome ${outcome}`);
}

function threeWay(home: number, away: number, outcome: string): Settled {
  const actual = home > away ? 'HOME' : home < away ? 'AWAY' : 'DRAW';
  return actual === outcome ? 'WON' : 'LOST';
}

/** One half of an Asian handicap: margin (centi) incl. line > 0 win, = 0 push, < 0 lose. */
function asianPart(marginCenti: number): -1 | 0 | 1 {
  return marginCenti > 0 ? 1 : marginCenti < 0 ? -1 : 0;
}

/**
 * Asian handicap, line applied to the home team (away gets -line).
 * Quarter lines (±0.25, ±0.75, …) split the stake across the two neighbouring half lines.
 */
export function settleAsianHandicap(home: number, away: number, homeLine: LineCenti, outcome: 'HOME' | 'AWAY'): Settled {
  const goalDiff = (outcome === 'HOME' ? home - away : away - home) * 100;
  const line = outcome === 'HOME' ? homeLine : -homeLine;
  const isQuarter = Math.abs(line) % 50 === 25;
  const parts = isQuarter ? [line - 25, line + 25] : [line, line];
  const [a, b] = parts.map((l) => asianPart(goalDiff + l)) as [number, number];
  const sum = a + b;
  if (sum === 2) return 'WON';
  if (sum === -2) return 'LOST';
  if (sum === 1) return 'HALF_WON';
  if (sum === -1) return 'HALF_LOST';
  return 'VOID'; // push+push (a win and a loss cannot happen on adjacent quarter halves)
}

/**
 * Settle one selection of a market against the match outcome (F2.9).
 * Void for cancelled matches and for player markets where the player did not appear.
 */
export function settleSelection(market: MarketSpec, outcome: string, r: MatchOutcome): Settled {
  if (r.cancelled) return 'VOID';
  const home = market.period === 'H1' ? r.htHome : r.ftHome;
  const away = market.period === 'H1' ? r.htAway : r.ftAway;

  switch (market.type) {
    case 'MATCH_RESULT':
      return threeWay(home, away, outcome);
    case 'DOUBLE_CHANCE': {
      const actual = home > away ? 'HOME' : home < away ? 'AWAY' : 'DRAW';
      const covered = outcome.split('_');
      return covered.includes(actual) ? 'WON' : 'LOST';
    }
    case 'TOTAL_GOALS':
      return overUnder(home + away, market.line, outcome);
    case 'TEAM_TOTAL_GOALS':
      return overUnder(market.team === 'AWAY' ? away : home, market.line, outcome);
    case 'BTTS': {
      const both = home > 0 && away > 0;
      return (outcome === 'YES') === both ? 'WON' : 'LOST';
    }
    case 'EUROPEAN_HANDICAP': {
      if (market.line === null) throw new Error('handicap needs a line');
      const adj = home * 100 + market.line;
      const actual = adj > away * 100 ? 'HOME' : adj < away * 100 ? 'AWAY' : 'DRAW';
      return actual === outcome ? 'WON' : 'LOST';
    }
    case 'ASIAN_HANDICAP':
      if (market.line === null) throw new Error('handicap needs a line');
      if (outcome !== 'HOME' && outcome !== 'AWAY') throw new Error(`bad AH outcome ${outcome}`);
      return settleAsianHandicap(home, away, market.line, outcome);
    case 'CORRECT_SCORE': {
      const listed = /^(\d+)-(\d+)$/.exec(outcome);
      if (outcome === 'OTHER') return home > 3 || away > 3 ? 'WON' : 'LOST';
      if (!listed) throw new Error(`bad correct score ${outcome}`);
      return Number(listed[1]) === home && Number(listed[2]) === away ? 'WON' : 'LOST';
    }
    case 'TOTAL_CORNERS':
      return overUnder(r.corners, market.line, outcome);
    case 'TOTAL_CARDS':
      return overUnder(r.cards, market.line, outcome);
    case 'ANYTIME_SCORER': {
      const p = r.players[outcome];
      if (!p || !p.appeared) return 'VOID';
      return p.goals > 0 ? 'WON' : 'LOST';
    }
    case 'PLAYER_SHOTS': {
      const p = market.playerRef ? r.players[market.playerRef] : undefined;
      if (!p || !p.appeared) return 'VOID';
      return overUnder(p.shots, market.line, outcome);
    }
  }
}

/**
 * A Bet Builder leg wins only when every part wins (F1.11). Any lost part loses the leg.
 * Because the leg has one correlated price, a void part (e.g. player did not appear)
 * voids the whole leg rather than re-pricing it. Builder markets never half-settle.
 */
export function combineBuilderParts(parts: readonly Settled[]): Settled {
  if (parts.some((p) => p === 'LOST' || p === 'HALF_LOST')) return 'LOST';
  if (parts.some((p) => p === 'VOID')) return 'VOID';
  return 'WON';
}
