import { type MarketPeriod, type MarketSpec, type MarketType, type Team, marketKey } from '@goalbet/shared';
import { scoreGrid } from '../mock/pricing.js';

/**
 * Real bookmaker prices from API-Football's /odds endpoint (available on the free plan, one call
 * per fixture). Prices are taken from the first bookmaker in the preference list that covers the
 * match: Superbet, then Betano (the closest Romanian book), Bet365, Pinnacle, else any.
 */
export const BOOKMAKER_PREFERENCE = [34, 32, 8, 4] as const;

export interface ApiOddsResponse {
  bookmakers: { id: number; name: string; bets: { id: number; name: string; values: { value: string | number; odd: string }[] }[] }[];
}

/** marketKey → outcome → odds (milli). */
export type BookPrices = Record<string, Record<string, number>>;

export interface BookOdds {
  bookmaker: string;
  prices: BookPrices;
  /** expected goals fitted to the book's 1X2 and total goals (prices the markets the book lacks, and live play) */
  lambdas: { home: number; away: number } | null;
}

const spec = (type: MarketType, p: Partial<MarketSpec> = {}): MarketSpec => ({ type, period: 'FT', line: null, team: null, playerRef: null, ...p });

const X12: Record<string, string> = { Home: 'HOME', Draw: 'DRAW', Away: 'AWAY' };
const DC: Record<string, string> = { 'Home/Draw': 'HOME_DRAW', 'Home/Away': 'HOME_AWAY', 'Draw/Away': 'DRAW_AWAY' };
const YN: Record<string, string> = { Yes: 'YES', No: 'NO' };

const milli = (odd: string) => {
  const n = Number(odd);
  return Number.isFinite(n) && n >= 1.01 ? Math.round(n * 1000) : null;
};
/** "2.5" → 250; only half-goal lines (whole and quarter lines differ from how our markets settle) */
const halfLine = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && Math.abs((n * 100) % 100) === 50 ? Math.round(n * 100) : null;
};
const anyLine = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/** Map one bet of the book onto our market specs; unknown bets are skipped. */
function mapBet(betId: number, value: string): { spec: MarketSpec; outcome: string } | null {
  const ou = /^(Over|Under) ([\d.]+)$/.exec(value);
  const side = /^(Home|Draw|Away) ([+-]?[\d.]+)$/.exec(value);
  const period = (p: MarketPeriod) => ({ period: p });
  const total = (type: MarketType, extra: Partial<MarketSpec>) => {
    const line = ou ? halfLine(ou[2]!) : null;
    return line === null ? null : { spec: spec(type, { ...extra, line }), outcome: ou![1]!.toUpperCase() };
  };
  switch (betId) {
    case 1: // Match Winner
      return X12[value] ? { spec: spec('MATCH_RESULT'), outcome: X12[value]! } : null;
    case 13: // First Half Winner
      return X12[value] ? { spec: spec('MATCH_RESULT', period('H1')), outcome: X12[value]! } : null;
    case 12: // Double Chance
      return DC[value] ? { spec: spec('DOUBLE_CHANCE'), outcome: DC[value]! } : null;
    case 8: // Both Teams Score
      return YN[value] ? { spec: spec('BTTS'), outcome: YN[value]! } : null;
    case 5: // Goals Over/Under
      return total('TOTAL_GOALS', {});
    case 6: // Goals Over/Under First Half
      return total('TOTAL_GOALS', period('H1'));
    case 16: // Total - Home
    case 17: // Total - Away
      return total('TEAM_TOTAL_GOALS', { team: (betId === 16 ? 'HOME' : 'AWAY') as Team });
    case 4: {
      // Asian Handicap: the number is the home team's line for both sides ("Away -0.5" = away +0.5)
      if (!side || side[1] === 'Draw') return null;
      const line = anyLine(side[2]!);
      return line === null ? null : { spec: spec('ASIAN_HANDICAP', { line }), outcome: side[1]!.toUpperCase() };
    }
    case 9: {
      // Handicap Result (European), same home-line convention
      if (!side) return null;
      const line = anyLine(side[2]!);
      return line === null ? null : { spec: spec('EUROPEAN_HANDICAP', { line }), outcome: side[1]!.toUpperCase() };
    }
    case 10: {
      // Exact Score "1:0" → "1-0" (we list 0-0 … 3-3 and OTHER)
      const m = /^(\d+):(\d+)$/.exec(value);
      return m && Number(m[1]) <= 3 && Number(m[2]) <= 3 ? { spec: spec('CORRECT_SCORE'), outcome: `${m[1]}-${m[2]}` } : null;
    }
    default:
      return null;
  }
}

/** Pick the preferred bookmaker and convert its prices; null when no bookmaker covers the match. */
export function parseBookOdds(res: ApiOddsResponse | undefined, preference: readonly number[] = BOOKMAKER_PREFERENCE): BookOdds | null {
  const books = res?.bookmakers ?? [];
  const usable = books.filter((b) => b.bets.some((x) => x.id === 1));
  const book = preference.map((id) => usable.find((b) => b.id === id)).find(Boolean) ?? usable[0];
  if (!book) return null;
  const prices: BookPrices = {};
  for (const bet of book.bets) {
    for (const v of bet.values) {
      const m = mapBet(bet.id, String(v.value));
      const odds = milli(v.odd);
      if (!m || odds === null) continue;
      (prices[marketKey(m.spec)] ??= {})[m.outcome] = odds;
    }
  }
  return { bookmaker: book.name, prices, lambdas: fitLambdas(prices) };
}

/** Margin-free probabilities of one market (proportional), or null when incomplete. */
function fair(prices: BookPrices, key: string, outcomes: string[]): number[] | null {
  const m = prices[key];
  if (!m || outcomes.some((o) => !m[o])) return null;
  const inv = outcomes.map((o) => 1000 / m[o]!);
  const sum = inv.reduce((a, b) => a + b, 0);
  return inv.map((x) => x / sum);
}

/**
 * Home and away expected goals whose Poisson score grid best reproduces the book's 1X2 and its
 * total-goals line (2.5, else 1.5/3.5), using the same score model that prices our markets. Coarse grid search, then a fine pass around the best point.
 */
export function fitLambdas(prices: BookPrices): { home: number; away: number } | null {
  const x12 = fair(prices, marketKey(spec('MATCH_RESULT')), ['HOME', 'DRAW', 'AWAY']);
  if (!x12) return null;
  const totals = [250, 150, 350]
    .map((line) => ({ line, p: fair(prices, marketKey(spec('TOTAL_GOALS', { line })), ['OVER', 'UNDER']) }))
    .find((t) => t.p);
  const N = 10;
  const error = (lh: number, la: number) => {
    const grid = scoreGrid(lh, la, N);
    let home = 0;
    let draw = 0;
    let over = 0;
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N; j++) {
        const p = grid[i]![j]!;
        if (i > j) home += p;
        else if (i === j) draw += p;
        if (totals && (i + j) * 100 > totals.line) over += p;
      }
    const away = 1 - home - draw;
    let e = (home - x12[0]!) ** 2 + (draw - x12[1]!) ** 2 + (away - x12[2]!) ** 2;
    if (totals) e += 2 * (over - totals.p![0]!) ** 2;
    return e;
  };
  let best = { home: 1.4, away: 1.1, e: Infinity };
  const search = (from: { home: number; away: number }, span: number, step: number) => {
    for (let h = Math.max(0.05, from.home - span); h <= from.home + span + 1e-9; h += step)
      for (let a = Math.max(0.05, from.away - span); a <= from.away + span + 1e-9; a += step) {
        const e = error(h, a);
        if (e < best.e) best = { home: h, away: a, e };
      }
  };
  search({ home: 2.3, away: 2.3 }, 2.2, 0.1);
  search(best, 0.1, 0.01);
  return { home: Math.round(best.home * 100) / 100, away: Math.round(best.away * 100) / 100 };
}
