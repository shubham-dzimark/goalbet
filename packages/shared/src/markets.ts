import type { MarketPeriod, MarketType, Team } from './enums.js';

/**
 * Market lines are stored as Decimal(5,2); in maths they are integer hundredths
 * ("centi-lines"): 2.5 -> 250, -0.75 -> -75.
 */
export type LineCenti = number;

export function parseLineCenti(value: string | number | { toString(): string } | null | undefined): LineCenti | null {
  if (value === null || value === undefined) return null;
  const s = value.toString().trim();
  const m = /^(-|\+)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error(`Invalid line: ${s}`);
  const v = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] === '-' ? -v : v;
}

export function lineToDecimalString(line: LineCenti): string {
  const sign = line < 0 ? '-' : '';
  const abs = Math.abs(line);
  return `${sign}${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, '0')}`;
}

/** Human line, e.g. 250 -> "2.5", -75 -> "-0.75", 100 -> "+1" when signed. */
export function formatLine(line: LineCenti, signed = false): string {
  const abs = Math.abs(line);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const body = frac === 0 ? `${whole}` : `${whole}.${frac.toString().padStart(2, '0').replace(/0$/, '')}`;
  if (line < 0) return `-${body}`;
  return signed && line > 0 ? `+${body}` : body;
}

/** Everything that identifies a market inside an event. */
export interface MarketSpec {
  type: MarketType;
  period: MarketPeriod;
  /** Goals/corners/cards/shots line or handicap (applied to the home team). */
  line: LineCenti | null;
  /** For TEAM_TOTAL_GOALS. */
  team: Team | null;
  /** Provider player id for PLAYER_SHOTS. */
  playerRef: string | null;
}

/** Stable market key within an event, e.g. "TOTAL_GOALS|FT|250||". */
export function marketKey(m: MarketSpec): string {
  return [m.type, m.period, m.line ?? '', m.team ?? '', m.playerRef ?? ''].join('|');
}

/** Inverse of marketKey. */
export function parseMarketKey(key: string): MarketSpec {
  const [type, period, line, team, playerRef] = key.split('|');
  return {
    type: type as MarketType,
    period: (period || 'FT') as MarketPeriod,
    line: line ? Number(line) : null,
    team: (team || null) as Team | null,
    playerRef: playerRef || null,
  };
}

/** UI tab groups on the match page (F1.9 / F5.3). */
export const MarketGroup = {
  MAIN: 'MAIN',
  GOALS: 'GOALS',
  HALF: 'HALF',
  HANDICAP: 'HANDICAP',
  CORNERS: 'CORNERS',
  CARDS: 'CARDS',
  SCORE: 'SCORE',
  PLAYERS: 'PLAYERS',
} as const;
export type MarketGroup = (typeof MarketGroup)[keyof typeof MarketGroup];
export const MARKET_GROUPS: MarketGroup[] = ['MAIN', 'GOALS', 'HALF', 'HANDICAP', 'CORNERS', 'CARDS', 'SCORE', 'PLAYERS'];

export function marketGroupOf(m: Pick<MarketSpec, 'type' | 'period'>): MarketGroup {
  if (m.period === 'H1') return 'HALF';
  switch (m.type) {
    case 'MATCH_RESULT':
    case 'DOUBLE_CHANCE':
    case 'BTTS':
      return 'MAIN';
    case 'TOTAL_GOALS':
    case 'TEAM_TOTAL_GOALS':
      return 'GOALS';
    case 'EUROPEAN_HANDICAP':
    case 'ASIAN_HANDICAP':
      return 'HANDICAP';
    case 'TOTAL_CORNERS':
      return 'CORNERS';
    case 'TOTAL_CARDS':
      return 'CARDS';
    case 'CORRECT_SCORE':
      return 'SCORE';
    case 'ANYTIME_SCORER':
    case 'PLAYER_SHOTS':
      return 'PLAYERS';
  }
}

/** Markets a Bet Builder may combine (F1.11). Asian lines are excluded because they can half-settle. */
export const BET_BUILDER_MARKET_TYPES: readonly MarketType[] = [
  'MATCH_RESULT',
  'DOUBLE_CHANCE',
  'TOTAL_GOALS',
  'TEAM_TOTAL_GOALS',
  'BTTS',
  'EUROPEAN_HANDICAP',
  'CORRECT_SCORE',
  'TOTAL_CORNERS',
  'TOTAL_CARDS',
  'ANYTIME_SCORER',
  'PLAYER_SHOTS',
];

/** Outcome codes per market type. Correct score uses "h-a" or "OTHER"; scorer uses the player ref. */
export const OUTCOMES = {
  MATCH_RESULT: ['HOME', 'DRAW', 'AWAY'],
  DOUBLE_CHANCE: ['HOME_DRAW', 'HOME_AWAY', 'DRAW_AWAY'],
  OVER_UNDER: ['OVER', 'UNDER'],
  BTTS: ['YES', 'NO'],
  EUROPEAN_HANDICAP: ['HOME', 'DRAW', 'AWAY'],
  ASIAN_HANDICAP: ['HOME', 'AWAY'],
} as const;

/** Correct score selections offered by the mock (0-0 .. 3-3 plus OTHER). */
export const CORRECT_SCORE_OUTCOMES: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h <= 3; h++) for (let a = 0; a <= 3; a++) out.push(`${h}-${a}`);
  out.push('OTHER');
  return out;
})();
