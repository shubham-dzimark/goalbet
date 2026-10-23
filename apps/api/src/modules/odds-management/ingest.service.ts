import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type MarketStatus, Prisma } from '@goalbet/db';
import {
  type EventStateMessage,
  type OddsChange,
  type OddsMessage,
  lineToDecimalString,
  oddsToDecimalString,
  parseOddsMilli,
} from '@goalbet/shared';
import { PrismaService } from '../../common/prisma.service.js';
import { Channels, RedisService } from '../../common/redis.service.js';
import { ODDS_PROVIDER, type OddsProvider, type ProviderLiveState, type ProviderMarket } from '../api-integration/odds-provider.js';

export interface LiveTransition {
  eventId: string;
  from: string;
  to: string;
}

const FEED_HEARTBEAT_KEY = 'feed:last-live-sync';

/**
 * F4.2 OddsManagement — pulls fixtures, odds, markets and live scores from the provider into the
 * database and publishes every change on Redis for the WebSocket gateway.
 */
@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(ODDS_PROVIDER) private readonly provider: OddsProvider,
  ) {}

  async syncCompetitions() {
    const comps = await this.provider.getCompetitions();
    for (const c of comps) {
      await this.prisma.competition.upsert({
        where: { providerRef: c.ref },
        create: { providerRef: c.ref, name: c.name, country: c.country, countryCode: c.countryCode, isTop: c.isTop, sortOrder: c.sortOrder },
        // enabled / isTop stay under admin control once created
        update: { name: c.name, country: c.country, countryCode: c.countryCode, sortOrder: c.sortOrder },
      });
    }
    return comps.length;
  }

  /** Upserts fixtures in [from, to]; returns ids of events that are new or still open. */
  async syncFixtures(from: Date, to: Date): Promise<string[]> {
    const fixtures = await this.provider.getFixtures(from, to);
    const comps = new Map(
      (await this.prisma.competition.findMany({ select: { id: true, providerRef: true } })).map((c) => [c.providerRef, c.id]),
    );
    const existing = new Map(
      (
        await this.prisma.event.findMany({
          where: { providerRef: { in: fixtures.map((f) => f.ref) } },
          select: { id: true, providerRef: true, startTime: true, status: true },
        })
      ).map((e) => [e.providerRef, e]),
    );
    const ids: string[] = [];
    for (const f of fixtures) {
      const competitionId = comps.get(f.competitionRef);
      if (!competitionId) continue;
      const ex = existing.get(f.ref);
      if (!ex) {
        const created = await this.prisma.event.create({
          data: {
            providerRef: f.ref,
            competitionId,
            homeTeam: f.home,
            awayTeam: f.away,
            startTime: f.startTime,
            isTop: f.isTop,
            players: f.players as unknown as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        ids.push(created.id);
      } else if (ex.status === 'SCHEDULED') {
        if (ex.startTime.getTime() !== f.startTime.getTime()) {
          await this.prisma.event.update({ where: { id: ex.id }, data: { startTime: f.startTime } });
        }
        ids.push(ex.id);
      }
    }
    return ids;
  }

  /** Pull markets + odds for one event and apply the diff. */
  async syncMarkets(eventId: string): Promise<OddsMessage | null> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, providerRef: true, status: true, markets: { include: { selections: true } } },
    });
    if (!event || event.status === 'FINISHED' || event.status === 'CANCELLED') return null;
    let provided: ProviderMarket[];
    try {
      provided = await this.provider.getMarkets(event.providerRef);
    } catch (e) {
      this.logger.warn(`markets for ${event.providerRef} failed: ${(e as Error).message}`);
      return null;
    }
    return this.applyMarkets(event.id, event.markets, provided);
  }

  private async applyMarkets(
    eventId: string,
    current: Prisma.MarketGetPayload<{ include: { selections: true } }>[],
    provided: ProviderMarket[],
  ): Promise<OddsMessage | null> {
    const byKey = new Map(current.map((m) => [m.key, m]));
    const seen = new Set<string>();
    const oddsChanges: OddsChange[] = [];
    const marketChanges: { marketId: string; status: MarketStatus }[] = [];
    const selUpdates: { id: string; odds: string; active: boolean }[] = [];
    const history: { selectionId: string; odds: string }[] = [];
    const newMarkets: Prisma.MarketCreateManyInput[] = [];
    const newSelections: Prisma.SelectionCreateManyInput[] = [];

    for (const [i, pm] of provided.entries()) {
      seen.add(pm.key);
      const existing = byKey.get(pm.key);
      const status: MarketStatus = pm.suspended ? 'SUSPENDED' : 'OPEN';
      if (!existing) {
        if (pm.selections.every((s) => s.oddsMilli === null)) continue;
        const marketId = randomUUID();
        newMarkets.push({
          id: marketId,
          eventId,
          key: pm.key,
          type: pm.type,
          period: pm.period,
          line: pm.line === null ? null : lineToDecimalString(pm.line),
          team: pm.team,
          playerRef: pm.playerRef,
          playerName: pm.playerName,
          status,
          sortOrder: i,
        });
        pm.selections.forEach((s, j) =>
          newSelections.push({
            marketId,
            outcome: s.outcome,
            label: s.label,
            team: s.team,
            odds: oddsToDecimalString(s.oddsMilli ?? 1010),
            active: s.oddsMilli !== null,
            sortOrder: j,
          }),
        );
        marketChanges.push({ marketId, status });
        continue;
      }
      if (existing.status === 'SETTLED') continue;
      if (existing.status !== status) {
        await this.prisma.market.update({ where: { id: existing.id }, data: { status } });
        marketChanges.push({ marketId: existing.id, status });
      }
      const sels = new Map(existing.selections.map((s) => [s.outcome, s]));
      for (const ps of pm.selections) {
        const s = sels.get(ps.outcome);
        if (!s) continue;
        const prev = parseOddsMilli(s.odds);
        const next = ps.oddsMilli ?? prev;
        const active = ps.oddsMilli !== null;
        if (next !== prev || active !== s.active) {
          selUpdates.push({ id: s.id, odds: oddsToDecimalString(next), active });
          oddsChanges.push({ selectionId: s.id, marketId: existing.id, oddsMilli: next, prevOddsMilli: prev, active });
          if (next !== prev) history.push({ selectionId: s.id, odds: oddsToDecimalString(next) });
        }
      }
    }

    if (newMarkets.length > 0) {
      await this.prisma.$transaction([
        this.prisma.market.createMany({ data: newMarkets, skipDuplicates: true }),
        this.prisma.selection.createMany({ data: newSelections, skipDuplicates: true }),
      ]);
    }

    // Markets the provider no longer offers (e.g. first-half markets after half time) are suspended.
    for (const m of current) {
      if (!seen.has(m.key) && m.status === 'OPEN') {
        await this.prisma.market.update({ where: { id: m.id }, data: { status: 'SUSPENDED' } });
        marketChanges.push({ marketId: m.id, status: 'SUSPENDED' });
      }
    }

    if (selUpdates.length > 0) {
      const values = Prisma.join(
        selUpdates.map((u) => Prisma.sql`(${u.id}::uuid, ${u.odds}::numeric(8,3), ${u.active}::boolean)`),
      );
      await this.prisma.$executeRaw`
        UPDATE "Selection" AS s SET "odds" = v.odds, "active" = v.active, "updatedAt" = now()
        FROM (VALUES ${values}) AS v(id, odds, active) WHERE s.id = v.id`;
      if (history.length > 0) await this.prisma.oddsHistory.createMany({ data: history });
    }

    if (oddsChanges.length === 0 && marketChanges.length === 0) return null;
    const msg: OddsMessage = { type: 'odds', eventId, selections: oddsChanges, markets: marketChanges };
    await this.redis.publish(Channels.EVENT_UPDATES, msg);
    return msg;
  }

  /**
   * Live scores (F1.6 / F2.2): update every live event's state and in-play odds.
   * Returns status transitions (e.g. SCHEDULED → LIVE, LIVE → FINISHED) for the workers.
   */
  async syncLive(): Promise<LiveTransition[]> {
    const states = await this.provider.getLiveStates();
    await this.redis.client.set(FEED_HEARTBEAT_KEY, String(Date.now()));
    const events = await this.prisma.event.findMany({
      where: { providerRef: { in: states.map((s) => s.ref) } },
      select: { id: true, providerRef: true, status: true, period: true, minute: true, homeScore: true, awayScore: true, corners: true, cards: true, suspended: true, feedSuspended: true },
    });
    const byRef = new Map(events.map((e) => [e.providerRef, e]));
    const transitions: LiveTransition[] = [];

    for (const st of states) {
      const ev = byRef.get(st.ref);
      if (!ev || ev.status === 'FINISHED' || ev.status === 'CANCELLED') continue;
      const changed =
        ev.status !== st.status ||
        ev.period !== st.period ||
        ev.minute !== st.minute ||
        ev.homeScore !== st.homeScore ||
        ev.awayScore !== st.awayScore ||
        ev.corners !== st.corners ||
        ev.cards !== st.cards ||
        ev.feedSuspended;
      if (changed) await this.applyLiveState(ev.id, ev.status, st);
      if (ev.status !== st.status) transitions.push({ eventId: ev.id, from: ev.status, to: st.status });
      if (changed) {
        const msg: EventStateMessage = {
          type: 'event',
          eventId: ev.id,
          status: st.status,
          period: st.period,
          minute: st.minute,
          homeScore: st.homeScore,
          awayScore: st.awayScore,
          corners: st.corners,
          cards: st.cards,
          suspended: ev.suspended || st.suspended,
        };
        await this.redis.publish(Channels.EVENT_UPDATES, msg);
      }
      if (st.status === 'LIVE') await this.syncMarkets(ev.id);
    }
    return transitions;
  }

  private async applyLiveState(eventId: string, currentStatus: string, st: ProviderLiveState) {
    const terminal = st.status === 'FINISHED' || st.status === 'CANCELLED';
    await this.prisma.event.update({
      where: { id: eventId },
      data: {
        status: terminal ? (currentStatus as 'SCHEDULED' | 'LIVE') : st.status,
        period: st.period,
        minute: st.minute,
        homeScore: st.homeScore,
        awayScore: st.awayScore,
        htHomeScore: st.htHomeScore,
        htAwayScore: st.htAwayScore,
        corners: st.corners,
        cards: st.cards,
        feedSuspended: false,
        lastFeedAt: new Date(),
      },
    });
    // FINISHED / CANCELLED are only written by the settlement engine once results are confirmed (F2.8).
  }

  async lastLiveSync(): Promise<number | null> {
    const v = await this.redis.client.get(FEED_HEARTBEAT_KEY);
    return v ? Number(v) : null;
  }

  /** Pre-match odds refresh for events kicking off soon. */
  async refreshPrematch(withinMs: number) {
    const events = await this.prisma.event.findMany({
      where: { status: 'SCHEDULED', startTime: { gte: new Date(), lte: new Date(Date.now() + withinMs) } },
      select: { id: true },
      orderBy: { startTime: 'asc' },
    });
    let changed = 0;
    for (const e of events) if (await this.syncMarkets(e.id)) changed++;
    return { events: events.length, changed };
  }
}
