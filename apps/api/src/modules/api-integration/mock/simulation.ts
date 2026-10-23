import { type EventStatus, type MatchOutcome, type MatchPeriod, type Team } from '@goalbet/shared';
import { type ProviderFixture, type ProviderLiveState, type ProviderPlayer } from '../odds-provider.js';
import { FIRST_NAMES, LAST_NAMES, MOCK_COMPETITIONS, type MockCompetition, SHOTS_RATE, SQUAD_SHAPE, SCORING_SHARE } from './data.js';
import { type PricingState } from './pricing.js';
import { hash32, pick, rand, rng } from './rng.js';

/**
 * Deterministic mock football world (F4.1).
 * One fixture kicks off every SLOT_MS around the clock; matches last 108–115 minutes, so 4–5 are
 * live at once, and never fewer than 3 even when a fixture is cancelled (cancellations are at
 * least CANCEL_SPACING slots apart). Everything (teams, goals, corners, cards, shots, stoppage
 * time, cancellations) is derived from the fixture ref, so all processes agree without shared state.
 */
export const SLOT_MS = 25 * 60_000;
const MIN = 60_000;
const HALF_TIME_MIN = 15;
const CANCEL_SPACING = 7;
const CANCEL_RATE = 0.15;

export interface MinuteEvent {
  /** 1..45+st1 first half, 46..90+st2 second half */
  minute: number;
  half: 1 | 2;
  type: 'GOAL' | 'CORNER' | 'CARD';
  team: Team;
  playerRef?: string;
}

export interface FixtureSeed {
  ref: string;
  slot: number;
  competition: MockCompetition;
  home: string;
  away: string;
  scheduledStart: number;
  isTop: boolean;
  lambdaHome: number;
  lambdaAway: number;
  st1: number;
  st2: number;
  cancelled: boolean;
  players: ProviderPlayer[];
  shotsTotal: Record<string, number>;
  timeline: MinuteEvent[];
}

/** Test/demo control applied on top of the deterministic world (stored in Redis by MockProvider). */
export interface MockOverride {
  kickoffAt?: number;
  finishAt?: number;
  finalScore?: { home: number; away: number };
  oddsFactorBps?: number;
  suspended?: boolean;
  cancelled?: boolean;
}

const COMP_WEIGHTS = MOCK_COMPETITIONS.flatMap((c) => Array.from({ length: Math.round(c.weight * 2) }, () => c));

function strength(comp: MockCompetition, team: string): number {
  const idx = comp.teams.indexOf(team);
  const n = comp.teams.length;
  return 1.4 - (0.65 * idx) / Math.max(1, n - 1) + (rand('str', team) - 0.5) * 0.1;
}

export function squad(team: string, side: Team): ProviderPlayer[] {
  const r = rng(hash32(`squad|${team}`));
  const used = new Set<string>();
  return SQUAD_SHAPE.map((position, i) => {
    let name: string;
    do name = `${pick(r, FIRST_NAMES)} ${pick(r, LAST_NAMES)}`;
    while (used.has(name));
    used.add(name);
    return { ref: `${hash32(team).toString(36)}-${i}`, name, team: side, position };
  });
}

const seedCache = new Map<number, FixtureSeed>();

export function fixtureSeed(slot: number): FixtureSeed {
  const cached = seedCache.get(slot);
  if (cached) return cached;
  const ref = `mock-${slot}`;
  const r = rng(hash32(ref));
  const competition = pick(r, COMP_WEIGHTS);
  const home = pick(r, competition.teams);
  let away = pick(r, competition.teams);
  while (away === home) away = pick(r, competition.teams);

  const sh = strength(competition, home);
  const sa = strength(competition, away);
  const lambdaHome = Math.max(0.35, 1.45 * (sh / sa) * 0.95);
  const lambdaAway = Math.max(0.3, 1.15 * (sa / sh) * 0.95);
  const st1 = 1 + Math.floor(r() * 4);
  const st2 = 2 + Math.floor(r() * 5);
  // ≈2 % of fixtures, never two within one match length of each other
  const cancelled = slot % CANCEL_SPACING === 0 && r() < CANCEL_RATE;
  const players = [...squad(home, 'HOME'), ...squad(away, 'AWAY')];

  const timeline: MinuteEvent[] = [];
  const minutes = [
    ...Array.from({ length: 45 + st1 }, (_, i) => ({ minute: i + 1, half: 1 as const })),
    ...Array.from({ length: 45 + st2 }, (_, i) => ({ minute: 46 + i, half: 2 as const })),
  ];
  const scorerPick = (team: Team) => {
    const pool = players.filter((p) => p.team === team && p.position !== 'GK');
    const total = pool.reduce((a, p) => a + SCORING_SHARE[p.position], 0);
    let x = r() * total;
    for (const p of pool) {
      x -= SCORING_SHARE[p.position];
      if (x <= 0) return p.ref;
    }
    return pool[pool.length - 1]!.ref;
  };
  for (const { minute, half } of minutes) {
    if (r() < lambdaHome / 90) timeline.push({ minute, half, type: 'GOAL', team: 'HOME', playerRef: scorerPick('HOME') });
    if (r() < lambdaAway / 90) timeline.push({ minute, half, type: 'GOAL', team: 'AWAY', playerRef: scorerPick('AWAY') });
    if (r() < 10.2 / 90) timeline.push({ minute, half, type: 'CORNER', team: r() < sh / (sh + sa) ? 'HOME' : 'AWAY' });
    if (r() < 4.3 / 90) timeline.push({ minute, half, type: 'CARD', team: r() < 0.5 ? 'HOME' : 'AWAY' });
  }
  const shotsTotal: Record<string, number> = {};
  for (const p of players) {
    const goals = timeline.filter((e) => e.type === 'GOAL' && e.playerRef === p.ref).length;
    shotsTotal[p.ref] = Math.max(goals, Math.round(SHOTS_RATE[p.position] * (0.4 + r() * 1.3)));
  }

  const seed: FixtureSeed = {
    ref,
    slot,
    competition,
    home,
    away,
    scheduledStart: slot * SLOT_MS,
    isTop: competition.isTop && r() < 0.5,
    lambdaHome,
    lambdaAway,
    st1,
    st2,
    cancelled,
    players,
    shotsTotal,
    timeline,
  };
  if (seedCache.size > 2000) seedCache.clear();
  seedCache.set(slot, seed);
  return seed;
}

export function slotOf(ref: string): number | null {
  const m = /^mock-(\d+)$/.exec(ref);
  return m ? Number(m[1]) : null;
}

export function toFixture(s: FixtureSeed, o?: MockOverride): ProviderFixture {
  return {
    ref: s.ref,
    competitionRef: s.competition.ref,
    home: s.home,
    away: s.away,
    startTime: new Date(o?.kickoffAt ?? s.scheduledStart),
    isTop: s.isTop,
    players: s.players,
  };
}

interface Clock {
  status: EventStatus;
  period: MatchPeriod;
  minute: number | null;
  /** Wall-clock time of a timeline minute (middle of the minute). */
  timeOf: (e: MinuteEvent) => number;
  /** Regulation minutes still to play, 0..90 */
  remainingMin: number;
  /** First-half regulation minutes still to play, 0..45 */
  remainingH1Min: number;
  endAt: number;
}

export function clock(s: FixtureSeed, now: number, o?: MockOverride): Clock {
  const start = o?.kickoffAt ?? s.scheduledStart;
  const h2Start = start + (45 + s.st1 + HALF_TIME_MIN) * MIN;
  const naturalEnd = h2Start + (45 + s.st2) * MIN;
  const endAt = o?.finishAt !== undefined ? Math.min(o.finishAt, naturalEnd) : naturalEnd;
  const timeOf = (e: MinuteEvent) =>
    e.half === 1 ? start + (e.minute - 0.5) * MIN : h2Start + (e.minute - 46 + 0.5) * MIN;
  const e = (now - start) / MIN;

  if ((o?.cancelled ?? s.cancelled) && now >= start) {
    return { status: 'CANCELLED', period: 'NOT_STARTED', minute: null, timeOf, remainingMin: 0, remainingH1Min: 0, endAt: start };
  }
  if (now < start) return { status: 'SCHEDULED', period: 'NOT_STARTED', minute: null, timeOf, remainingMin: 90, remainingH1Min: 45, endAt };
  if (now >= endAt) return { status: 'FINISHED', period: 'FULL_TIME', minute: 90, timeOf, remainingMin: 0, remainingH1Min: 0, endAt };
  // Remaining minutes include the stoppage still to play, so prices stay open until the whistle.
  if (e < 45 + s.st1) {
    return {
      status: 'LIVE',
      period: 'FIRST_HALF',
      minute: Math.floor(e) + 1,
      timeOf,
      remainingMin: 45 + s.st1 - e + 45,
      remainingH1Min: 45 + s.st1 - e,
      endAt,
    };
  }
  if (now < h2Start) return { status: 'LIVE', period: 'HALF_TIME', minute: 45, timeOf, remainingMin: 45, remainingH1Min: 0, endAt };
  const e2 = (now - h2Start) / MIN;
  return {
    status: 'LIVE',
    period: 'SECOND_HALF',
    minute: 46 + Math.floor(e2),
    timeOf,
    remainingMin: Math.max(0, 45 + s.st2 - e2),
    remainingH1Min: 0,
    endAt,
  };
}

export interface MatchSnapshot {
  clock: Clock;
  homeScore: number;
  awayScore: number;
  htHome: number;
  htAway: number;
  corners: number;
  cards: number;
  goalsByPlayer: Record<string, number>;
  shotsByPlayer: Record<string, number>;
  /** a goal happened in the last 60 s → markets suspended */
  recentGoal: boolean;
}

export function snapshot(s: FixtureSeed, now: number, o?: MockOverride): MatchSnapshot {
  const c = clock(s, now, o);
  const at = Math.min(now, c.endAt);
  const happened = c.status === 'SCHEDULED' || c.status === 'CANCELLED' ? [] : s.timeline.filter((e) => c.timeOf(e) <= at);
  let homeScore = 0;
  let awayScore = 0;
  let htHome = 0;
  let htAway = 0;
  let corners = 0;
  let cards = 0;
  const goalsByPlayer: Record<string, number> = {};
  let recentGoal = false;
  for (const e of happened) {
    if (e.type === 'GOAL') {
      if (e.team === 'HOME') homeScore++;
      else awayScore++;
      if (e.half === 1) {
        if (e.team === 'HOME') htHome++;
        else htAway++;
      }
      if (e.playerRef) goalsByPlayer[e.playerRef] = (goalsByPlayer[e.playerRef] ?? 0) + 1;
      if (now - c.timeOf(e) < 60_000) recentGoal = true;
    } else if (e.type === 'CORNER') corners++;
    else cards++;
  }
  if (o?.finalScore) {
    homeScore = o.finalScore.home;
    awayScore = o.finalScore.away;
    htHome = Math.min(htHome, homeScore);
    htAway = Math.min(htAway, awayScore);
  }
  const played = c.status === 'FINISHED' ? 1 : c.status === 'LIVE' ? Math.min(1, Math.max(0, 1 - c.remainingMin / 90)) : 0;
  const shotsByPlayer: Record<string, number> = {};
  for (const p of s.players) {
    shotsByPlayer[p.ref] = Math.max(goalsByPlayer[p.ref] ?? 0, Math.floor((s.shotsTotal[p.ref] ?? 0) * played));
  }
  return { clock: c, homeScore, awayScore, htHome, htAway, corners, cards, goalsByPlayer, shotsByPlayer, recentGoal };
}

export function liveState(s: FixtureSeed, now: number, o?: MockOverride): ProviderLiveState {
  const snap = snapshot(s, now, o);
  const c = snap.clock;
  const halfDone = c.period === 'HALF_TIME' || c.period === 'SECOND_HALF' || c.period === 'FULL_TIME';
  // ~4 % of the time a live match is randomly suspended for 30 s (VAR, injury, feed glitch).
  const randomSuspend = c.status === 'LIVE' && rand(s.ref, 'susp', Math.floor(now / 30_000)) < 0.04;
  return {
    ref: s.ref,
    status: c.status,
    period: c.period,
    minute: c.minute,
    homeScore: snap.homeScore,
    awayScore: snap.awayScore,
    htHomeScore: halfDone ? snap.htHome : null,
    htAwayScore: halfDone ? snap.htAway : null,
    corners: snap.corners,
    cards: snap.cards,
    suspended: Boolean(o?.suspended) || snap.recentGoal || randomSuspend,
  };
}

export function finalOutcome(s: FixtureSeed, now: number, o?: MockOverride): MatchOutcome | null {
  const snap = snapshot(s, now, o);
  if (snap.clock.status === 'CANCELLED') {
    return { cancelled: true, ftHome: 0, ftAway: 0, htHome: 0, htAway: 0, corners: 0, cards: 0, players: {} };
  }
  if (snap.clock.status !== 'FINISHED') return null;
  const players: MatchOutcome['players'] = {};
  for (const p of s.players) {
    players[p.ref] = { appeared: true, goals: snap.goalsByPlayer[p.ref] ?? 0, shots: snap.shotsByPlayer[p.ref] ?? 0 };
  }
  return {
    ftHome: snap.homeScore,
    ftAway: snap.awayScore,
    htHome: snap.htHome,
    htAway: snap.htAway,
    corners: snap.corners,
    cards: snap.cards,
    players,
  };
}

/** Inputs for the pricing model at `now` (pre-match drift every 30 min, live drift every 20 s). */
export function pricingState(s: FixtureSeed, now: number, o?: MockOverride): PricingState | null {
  const snap = snapshot(s, now, o);
  const c = snap.clock;
  if (c.status === 'FINISHED' || c.status === 'CANCELLED') return null;
  const live = c.status === 'LIVE';
  const bucket = live ? Math.floor(now / 20_000) : Math.floor(now / (30 * MIN));
  const drift = 1 + (rand(s.ref, 'drift', bucket) - 0.5) * (live ? 0.06 : 0.08);
  const remaining = Math.min(1, c.remainingMin / 90);
  const remainingH1 = c.remainingH1Min / 90;
  const live_ = live ? liveState(s, now, o) : null;
  return {
    lambdaHome: s.lambdaHome * remaining * drift,
    lambdaAway: (s.lambdaAway * remaining) / drift,
    lambdaHomeH1: s.lambdaHome * remainingH1 * 0.9 * drift,
    lambdaAwayH1: (s.lambdaAway * remainingH1 * 0.9) / drift,
    homeScore: snap.homeScore,
    awayScore: snap.awayScore,
    htHome: snap.htHome,
    htAway: snap.htAway,
    h1Open: c.remainingH1Min > 0,
    corners: snap.corners,
    lambdaCorners: 10.2 * remaining,
    cards: snap.cards,
    lambdaCards: 4.3 * remaining,
    remaining,
    players: s.players.map((p) => ({ ...p, goals: snap.goalsByPlayer[p.ref] ?? 0, shots: snap.shotsByPlayer[p.ref] ?? 0 })),
    oddsFactorBps: o?.oddsFactorBps ?? 10_000,
    suspended: live_?.suspended ?? false,
  };
}
