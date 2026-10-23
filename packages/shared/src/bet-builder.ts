import type { Team } from './enums.js';
import { BET_BUILDER_MARKET_TYPES, type MarketSpec, marketKey } from './markets.js';
import { type OddsMilli, combineOdds, roundHalfUp } from './odds.js';
import { type MatchOutcome, settleSelection } from './settlement.js';

export const BET_BUILDER_MIN_SELECTIONS = 2;
export const BET_BUILDER_MAX_SELECTIONS = 12;
export const DEFAULT_BET_BUILDER_FACTOR_BPS = 8500;
export const BET_BUILDER_MIN_ODDS_MILLI = 1010;

export interface BuilderSelection {
  market: MarketSpec;
  outcome: string;
  oddsMilli: OddsMilli;
  /** Team of the player for ANYTIME_SCORER selections (outcome = player ref). */
  playerTeam?: Team | null;
}

export type BuilderError = 'TOO_FEW' | 'TOO_MANY' | 'SAME_MARKET' | 'UNSUPPORTED_MARKET' | 'CONTRADICTION';

const GOAL_TYPES = new Set([
  'MATCH_RESULT',
  'DOUBLE_CHANCE',
  'TOTAL_GOALS',
  'TEAM_TOTAL_GOALS',
  'BTTS',
  'EUROPEAN_HANDICAP',
  'CORRECT_SCORE',
]);
const MAX_GOALS = 8;

function emptyOutcome(): MatchOutcome {
  return { ftHome: 0, ftAway: 0, htHome: 0, htAway: 0, corners: 0, cards: 0, players: {} };
}

/** Is there any value in [min, max] for which every selection of a single-number market wins? */
function feasibleCount(
  sels: BuilderSelection[],
  max: number,
  apply: (o: MatchOutcome, n: number) => void,
  min = 0,
): boolean {
  if (sels.length === 0) return true;
  for (let n = min; n <= max; n++) {
    const o = emptyOutcome();
    apply(o, n);
    if (sels.every((s) => settleSelection(s.market, s.outcome, o) === 'WON')) return true;
  }
  return false;
}

/**
 * Contradiction check (F1.11): searches for at least one possible match outcome in which
 * every selection wins, re-using the settlement rules so pricing and settlement agree.
 * Goal markets, scorers and half-time markets are searched jointly; corners, cards and
 * per-player shots are independent dimensions.
 */
export function isBuilderFeasible(sels: readonly BuilderSelection[]): boolean {
  const goal = sels.filter((s) => GOAL_TYPES.has(s.market.type));
  const corners = sels.filter((s) => s.market.type === 'TOTAL_CORNERS');
  const cards = sels.filter((s) => s.market.type === 'TOTAL_CARDS');
  const scorers = sels.filter((s) => s.market.type === 'ANYTIME_SCORER');
  const shots = sels.filter((s) => s.market.type === 'PLAYER_SHOTS');

  if (!feasibleCount(corners, 40, (o, n) => (o.corners = n))) return false;
  if (!feasibleCount(cards, 20, (o, n) => (o.cards = n))) return false;

  // Each player: a scorer needs ≥ 1 goal and at least as many shots as goals.
  const scorerRefs = new Set(scorers.map((s) => s.outcome));
  const shotsByPlayer = new Map<string, BuilderSelection[]>();
  for (const s of shots) {
    const ref = s.market.playerRef ?? '';
    shotsByPlayer.set(ref, [...(shotsByPlayer.get(ref) ?? []), s]);
  }
  for (const [ref, list] of shotsByPlayer) {
    const minShots = scorerRefs.has(ref) ? 1 : 0;
    const ok = feasibleCount(list, 20, (o, n) => (o.players[ref] = { appeared: true, goals: 0, shots: n }), minShots);
    if (!ok) return false;
  }

  const homeScorers = scorers.filter((s) => s.playerTeam === 'HOME').length;
  const awayScorers = scorers.filter((s) => s.playerTeam === 'AWAY').length;

  for (let ftH = homeScorers; ftH <= MAX_GOALS; ftH++) {
    for (let ftA = awayScorers; ftA <= MAX_GOALS; ftA++) {
      for (let htH = 0; htH <= ftH; htH++) {
        for (let htA = 0; htA <= ftA; htA++) {
          const o: MatchOutcome = { ...emptyOutcome(), ftHome: ftH, ftAway: ftA, htHome: htH, htAway: htA };
          if (goal.every((s) => settleSelection(s.market, s.outcome, o) === 'WON')) return true;
        }
      }
    }
  }
  return false;
}

/** Validate a Bet Builder combination; returns the first error or null when it can be priced. */
export function validateBuilder(sels: readonly BuilderSelection[]): BuilderError | null {
  if (sels.length < BET_BUILDER_MIN_SELECTIONS) return 'TOO_FEW';
  if (sels.length > BET_BUILDER_MAX_SELECTIONS) return 'TOO_MANY';
  if (sels.some((s) => !BET_BUILDER_MARKET_TYPES.includes(s.market.type))) return 'UNSUPPORTED_MARKET';
  // Scorer outcomes are not mutually exclusive, so several scorers may share the market.
  const keys = new Set(
    sels.map((s) => marketKey(s.market) + (s.market.type === 'ANYTIME_SCORER' ? `#${s.outcome}` : '')),
  );
  if (keys.size !== sels.length) return 'SAME_MARKET';
  if (!isBuilderFeasible(sels)) return 'CONTRADICTION';
  return null;
}

/**
 * Fallback Bet Builder price when the provider cannot price the combination:
 * product of odds × correlation factor (default 0.85), never below 1.01.
 */
export function fallbackBuilderOdds(
  odds: readonly OddsMilli[],
  factorBps = DEFAULT_BET_BUILDER_FACTOR_BPS,
): OddsMilli {
  const product = combineOdds(odds);
  const priced = Number(roundHalfUp(BigInt(product) * BigInt(factorBps), 10_000n));
  return Math.max(BET_BUILDER_MIN_ODDS_MILLI, priced);
}
