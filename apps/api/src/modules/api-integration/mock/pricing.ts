import {
  CORRECT_SCORE_OUTCOMES,
  type MarketPeriod,
  type MarketSpec,
  type MarketType,
  type MatchOutcome,
  type OddsMilli,
  type Team,
  marketKey,
  settleSelection,
} from '@goalbet/shared';
import { type ProviderMarket, type ProviderPlayer, type ProviderSelection } from '../odds-provider.js';
import { SCORING_SHARE, SHOTS_RATE } from './data.js';

/**
 * Poisson pricing for the mock provider. Every selection is priced by enumerating possible
 * outcomes and running the *shared settlement rules* on each, so a price can never disagree
 * with how the selection will later settle (incl. Asian half results and pushes).
 */

const MAX_GOALS = 10;

export function poisson(lambda: number, max: number): number[] {
  const out: number[] = [];
  let p = Math.exp(-lambda);
  for (let k = 0; k <= max; k++) {
    out.push(p);
    p = (p * lambda) / (k + 1);
  }
  // fold the tail into the last bucket so the distribution sums to 1
  const sum = out.reduce((a, b) => a + b, 0);
  out[max] = (out[max] ?? 0) + Math.max(0, 1 - sum);
  return out;
}

export interface PricingState {
  /** Remaining expected goals (already scaled by time left and drift). */
  lambdaHome: number;
  lambdaAway: number;
  /** Remaining expected goals in the first half (0 once half time is reached). */
  lambdaHomeH1: number;
  lambdaAwayH1: number;
  homeScore: number;
  awayScore: number;
  htHome: number;
  htAway: number;
  /** Is the first half still open for betting? */
  h1Open: boolean;
  corners: number;
  lambdaCorners: number;
  cards: number;
  lambdaCards: number;
  /** Fraction of the match still to play (0..1). */
  remaining: number;
  players: (ProviderPlayer & { goals: number; shots: number })[];
  /** Global multiplier for test control (basis points, 10000 = unchanged). */
  oddsFactorBps: number;
  suspended: boolean;
}

interface Dist {
  p: number;
  o: MatchOutcome;
}

const baseOutcome = (s: PricingState): MatchOutcome => ({
  ftHome: s.homeScore,
  ftAway: s.awayScore,
  htHome: s.htHome,
  htAway: s.htAway,
  corners: s.corners,
  cards: s.cards,
  players: {},
});

function goalDist(s: PricingState, period: MarketPeriod): Dist[] {
  const ph = poisson(period === 'H1' ? s.lambdaHomeH1 : s.lambdaHome, MAX_GOALS);
  const pa = poisson(period === 'H1' ? s.lambdaAwayH1 : s.lambdaAway, MAX_GOALS);
  const out: Dist[] = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = (ph[i] ?? 0) * (pa[j] ?? 0);
      if (p < 1e-9) continue;
      const o = baseOutcome(s);
      if (period === 'H1') {
        o.htHome = s.htHome + i;
        o.htAway = s.htAway + j;
      } else {
        o.ftHome = s.homeScore + i;
        o.ftAway = s.awayScore + j;
      }
      out.push({ p, o });
    }
  }
  return out;
}

function countDist(s: PricingState, current: number, lambda: number, set: (o: MatchOutcome, n: number) => void): Dist[] {
  return poisson(lambda, 30).map((p, k) => {
    const o = baseOutcome(s);
    set(o, current + k);
    return { p, o };
  });
}

/** Fair decimal odds from the result distribution (EV = 0), or null when there is no value. */
function fairOdds(spec: MarketSpec, outcome: string, dist: Dist[]): number | null {
  let w = 0;
  let hw = 0;
  let hl = 0;
  let l = 0;
  for (const d of dist) {
    switch (settleSelection(spec, outcome, d.o)) {
      case 'WON':
        w += d.p;
        break;
      case 'HALF_WON':
        hw += d.p;
        break;
      case 'HALF_LOST':
        hl += d.p;
        break;
      case 'LOST':
        l += d.p;
        break;
      default:
        break;
    }
  }
  const win = w + hw / 2;
  const lose = l + hl / 2;
  if (win < 0.004 || lose < 0.004) return null; // decided or practically decided
  return 1 + lose / win;
}

/** Bookmaker margin, then round to a realistic price ladder. */
export function toOdds(fair: number | null, margin: number, factorBps = 10_000): OddsMilli | null {
  if (fair === null) return null;
  const priced = (fair / (1 + margin)) * (factorBps / 10_000);
  if (priced < 1.01) return 1010;
  const capped = Math.min(priced, 250);
  const step = capped < 10 ? 0.01 : capped < 20 ? 0.05 : capped < 50 ? 0.5 : 1;
  const rounded = Math.max(1.01, Math.floor(capped / step) * step);
  return Math.round(rounded * 1000);
}

const MARGIN: Partial<Record<MarketType, number>> = {
  MATCH_RESULT: 0.055,
  DOUBLE_CHANCE: 0.05,
  TOTAL_GOALS: 0.06,
  BTTS: 0.06,
  ASIAN_HANDICAP: 0.05,
  CORRECT_SCORE: 0.15,
  ANYTIME_SCORER: 0.12,
  PLAYER_SHOTS: 0.1,
};
const marginOf = (t: MarketType) => MARGIN[t] ?? 0.08;

function market(
  spec: MarketSpec,
  outcomes: { outcome: string; label?: string | null; team?: Team | null }[],
  dist: Dist[],
  s: PricingState,
  extra: { playerName?: string | null } = {},
): ProviderMarket {
  const selections: ProviderSelection[] = outcomes.map((x) => ({
    outcome: x.outcome,
    label: x.label ?? null,
    team: x.team ?? null,
    oddsMilli: toOdds(fairOdds(spec, x.outcome, dist), marginOf(spec.type), s.oddsFactorBps),
  }));
  const open = selections.some((x) => x.oddsMilli !== null);
  return {
    key: marketKey(spec),
    type: spec.type,
    period: spec.period,
    line: spec.line,
    team: spec.team,
    playerRef: spec.playerRef,
    playerName: extra.playerName ?? null,
    suspended: s.suspended || !open,
    selections,
  };
}

const spec = (type: MarketType, p: Partial<MarketSpec> = {}): MarketSpec => ({
  type,
  period: 'FT',
  line: null,
  team: null,
  playerRef: null,
  ...p,
});

const OU = [{ outcome: 'OVER' }, { outcome: 'UNDER' }];
const X12 = [{ outcome: 'HOME' }, { outcome: 'DRAW' }, { outcome: 'AWAY' }];

export const GOAL_LINES = [50, 150, 250, 350, 450, 550];
export const TEAM_GOAL_LINES = [50, 150, 250];
export const EURO_HANDICAP_LINES = [-100, 100];
export const ASIAN_LINES = [-150, -100, -75, -50, -25, 0, 25, 50];
export const CORNER_LINES = [750, 850, 950, 1050, 1150];
export const CARD_LINES = [250, 350, 450, 550];
export const H1_GOAL_LINES = [50, 150];

/** Every market group from F1.9 for one fixture. */
export function priceMarkets(s: PricingState): ProviderMarket[] {
  const ft = goalDist(s, 'FT');
  const out: ProviderMarket[] = [];

  out.push(market(spec('MATCH_RESULT'), X12, ft, s));
  out.push(
    market(spec('DOUBLE_CHANCE'), [{ outcome: 'HOME_DRAW' }, { outcome: 'HOME_AWAY' }, { outcome: 'DRAW_AWAY' }], ft, s),
  );
  out.push(market(spec('BTTS'), [{ outcome: 'YES' }, { outcome: 'NO' }], ft, s));
  for (const line of GOAL_LINES) out.push(market(spec('TOTAL_GOALS', { line }), OU, ft, s));
  for (const team of ['HOME', 'AWAY'] as const)
    for (const line of TEAM_GOAL_LINES) out.push(market(spec('TEAM_TOTAL_GOALS', { line, team }), OU, ft, s));
  for (const line of EURO_HANDICAP_LINES) out.push(market(spec('EUROPEAN_HANDICAP', { line }), X12, ft, s));
  for (const line of ASIAN_LINES)
    out.push(market(spec('ASIAN_HANDICAP', { line }), [{ outcome: 'HOME' }, { outcome: 'AWAY' }], ft, s));
  out.push(
    market(
      spec('CORRECT_SCORE'),
      CORRECT_SCORE_OUTCOMES.map((outcome) => ({ outcome })),
      ft,
      s,
    ),
  );

  if (s.h1Open) {
    const h1 = goalDist(s, 'H1');
    out.push(market(spec('MATCH_RESULT', { period: 'H1' }), X12, h1, s));
    for (const line of H1_GOAL_LINES) out.push(market(spec('TOTAL_GOALS', { period: 'H1', line }), OU, h1, s));
  }

  const corners = countDist(s, s.corners, s.lambdaCorners, (o, n) => (o.corners = n));
  for (const line of CORNER_LINES) out.push(market(spec('TOTAL_CORNERS', { line }), OU, corners, s));
  const cards = countDist(s, s.cards, s.lambdaCards, (o, n) => (o.cards = n));
  for (const line of CARD_LINES) out.push(market(spec('TOTAL_CARDS', { line }), OU, cards, s));

  out.push(scorerMarket(s));
  for (const p of s.players) {
    if (p.position !== 'FW' && p.position !== 'MF') continue;
    out.push(shotsMarket(s, p));
  }
  return out;
}

function shareOf(p: ProviderPlayer, team: ProviderPlayer[]): number {
  const total = team.reduce((a, x) => a + SCORING_SHARE[x.position], 0) || 1;
  return SCORING_SHARE[p.position] / total;
}

function scorerMarket(s: PricingState): ProviderMarket {
  const selections: ProviderSelection[] = [];
  for (const p of s.players) {
    if (p.position === 'GK') continue;
    const teamPlayers = s.players.filter((x) => x.team === p.team);
    const lambdaTeam = p.team === 'HOME' ? s.lambdaHome : s.lambdaAway;
    const prob = p.goals > 0 ? 1 : 1 - Math.exp(-lambdaTeam * shareOf(p, teamPlayers));
    const fair = prob >= 0.996 || prob < 0.004 ? null : 1 / prob;
    selections.push({ outcome: p.ref, label: p.name, team: p.team, oddsMilli: toOdds(fair, marginOf('ANYTIME_SCORER'), s.oddsFactorBps) });
  }
  return {
    key: marketKey(spec('ANYTIME_SCORER')),
    type: 'ANYTIME_SCORER',
    period: 'FT',
    line: null,
    team: null,
    playerRef: null,
    playerName: null,
    suspended: s.suspended,
    selections,
  };
}

function shotsMarket(s: PricingState, p: PricingState['players'][number]): ProviderMarket {
  const line = p.position === 'FW' ? 150 : 50;
  const m = spec('PLAYER_SHOTS', { playerRef: p.ref, line });
  const lambda = SHOTS_RATE[p.position] * s.remaining;
  const dist = poisson(lambda, 20).map((prob, k) => {
    const o = baseOutcome(s);
    o.players[p.ref] = { appeared: true, goals: p.goals, shots: p.shots + k };
    return { p: prob, o };
  });
  return market(m, OU, dist, s, { playerName: p.name });
}

/**
 * Correlated Bet Builder price for goal-based combinations (F1.11 "if supported"): joint
 * probability over the score grid. Returns null when a leg is outside the goal grid model
 * (corners, cards, players), so the engine falls back to the correlation-factor formula.
 */
export function priceBuilderJoint(s: PricingState, legs: { spec: MarketSpec; outcome: string }[]): OddsMilli | null {
  const supported = new Set<MarketType>(['MATCH_RESULT', 'DOUBLE_CHANCE', 'TOTAL_GOALS', 'TEAM_TOTAL_GOALS', 'BTTS', 'EUROPEAN_HANDICAP', 'CORRECT_SCORE']);
  if (legs.some((l) => !supported.has(l.spec.type) || l.spec.period !== 'FT')) return null;
  let p = 0;
  for (const d of goalDist(s, 'FT')) {
    if (legs.every((l) => settleSelection(l.spec, l.outcome, d.o) === 'WON')) p += d.p;
  }
  if (p < 0.002) return null;
  return toOdds(1 / p, 0.12, s.oddsFactorBps);
}
