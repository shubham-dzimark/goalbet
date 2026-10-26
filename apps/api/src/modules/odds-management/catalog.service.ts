import { Injectable } from '@nestjs/common';
import { type MarketType, type Prisma } from '@goalbet/db';
import {
  type BoostDto,
  type CountryGroupDto,
  type EventDetailDto,
  type EventSummaryDto,
  type HomeFeedDto,
} from '@goalbet/shared';
import { DomainError } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { boostActive, marketInclude, toCompetition, toDetail, toMarket, toSelection, toSummary } from './catalog.mappers.js';

const HOUR = 3600_000;

/**
 * Read side of OddsManagement for the player site (F1.1, F1.5, F1.6, F1.9). Only enabled
 * competitions, markets and market types are ever shown (F3.5).
 */
@Injectable()
export class CatalogService {
  private disabledTypes: { at: number; value: MarketType[] } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async disabledMarketTypes(): Promise<MarketType[]> {
    if (this.disabledTypes && Date.now() - this.disabledTypes.at < 5_000) return this.disabledTypes.value;
    const rows = await this.prisma.marketTypeSetting.findMany({ where: { enabled: false }, select: { type: true } });
    this.disabledTypes = { at: Date.now(), value: rows.map((r) => r.type) };
    return this.disabledTypes.value;
  }

  private async visibleMarkets(): Promise<Prisma.MarketWhereInput> {
    return { enabled: true, status: { not: 'SETTLED' }, type: { notIn: await this.disabledMarketTypes() } };
  }

  /** Events that can still be bet on: upcoming (kick-off in the future) or live. */
  private openEvents(extra: Prisma.EventWhereInput = {}): Prisma.EventWhereInput {
    return {
      competition: { enabled: true, active: true },
      OR: [{ status: 'LIVE' }, { status: 'SCHEDULED', startTime: { gt: new Date() } }],
      ...extra,
    };
  }

  private async summaryInclude() {
    const visible = await this.visibleMarkets();
    return {
      competition: true,
      markets: { where: { ...visible, type: 'MATCH_RESULT' as const, period: 'FT' as const }, include: marketInclude },
      _count: { select: { markets: { where: visible } } },
    } satisfies Prisma.EventInclude;
  }

  async summaries(where: Prisma.EventWhereInput, orderBy: Prisma.EventOrderByWithRelationInput[], take: number) {
    const rows = await this.prisma.event.findMany({
      where: this.openEvents(where),
      include: await this.summaryInclude(),
      orderBy,
      take,
    });
    return rows.map(toSummary);
  }

  async liveCount() {
    return this.prisma.event.count({ where: { status: 'LIVE', competition: { enabled: true, active: true } } });
  }

  /** F1.1 homepage feed. */
  async home(): Promise<HomeFeedDto> {
    const now = Date.now();
    const [liveCount, topLive, topMatches, boosted, topCompetitions] = await Promise.all([
      this.liveCount(),
      this.summaries({ status: 'LIVE' }, [{ isTop: 'desc' }, { competition: { isTop: 'desc' } }, { startTime: 'asc' }], 10),
      this.summaries(
        {
          status: 'SCHEDULED',
          startTime: { gt: new Date(now), lt: new Date(now + 48 * HOUR) },
          OR: [{ isTop: true }, { competition: { isTop: true } }],
        },
        [{ startTime: 'asc' }],
        12,
      ),
      this.boosts(6),
      this.topCompetitions(),
    ]);
    return { liveCount, topLive, topMatches, boosted, topCompetitions };
  }

  async boosts(take: number): Promise<BoostDto[]> {
    const now = new Date();
    const boosts = await this.prisma.oddsBoost.findMany({
      where: {
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        selection: {
          active: true,
          market: { ...(await this.visibleMarkets()), status: 'OPEN', event: this.openEvents() },
        },
      },
      include: {
        selection: {
          include: { boost: true, market: { include: { ...marketInclude, event: { include: await this.summaryInclude() } } } },
        },
      },
      orderBy: { selection: { market: { event: { startTime: 'asc' } } } },
      take,
    });
    return boosts
      .filter((b) => boostActive(b))
      .map((b) => ({
        event: toSummary(b.selection.market.event),
        market: toMarket(b.selection.market),
        selection: toSelection(b.selection),
      }));
  }

  async topCompetitions() {
    const comps = await this.prisma.competition.findMany({
      where: { enabled: true, active: true, isTop: true },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { events: { where: this.openEvents() } } } },
    });
    return comps.map((c) => ({ ...toCompetition(c), upcoming: c._count.events }));
  }

  /** F1.5 — country → competition navigation with counts. */
  async countries(): Promise<CountryGroupDto[]> {
    const comps = await this.prisma.competition.findMany({
      where: { enabled: true, active: true },
      orderBy: [{ sortOrder: 'asc' }],
      include: {
        _count: { select: { events: { where: this.openEvents() } } },
        events: { where: { status: 'LIVE' }, select: { id: true } },
      },
    });
    const groups = new Map<string, CountryGroupDto>();
    for (const c of comps) {
      const g = groups.get(c.countryCode) ?? { country: c.country, countryCode: c.countryCode, competitions: [] };
      g.competitions.push({ ...toCompetition(c), upcoming: c._count.events, live: c.events.length });
      groups.set(c.countryCode, g);
    }
    return [...groups.values()];
  }

  /** F1.5 — a competition's matches for the next 7 days, grouped by date on the client. */
  async competition(id: string) {
    const comp = await this.prisma.competition.findFirst({ where: { id, enabled: true, active: true } });
    if (!comp) throw new DomainError('NOT_FOUND');
    const events = await this.summaries(
      { competitionId: id, startTime: { lt: new Date(Date.now() + 7 * 24 * HOUR) } },
      [{ startTime: 'asc' }],
      200,
    );
    return { competition: toCompetition(comp), events };
  }

  /** Upcoming matches starting within the next `hours` (all competitions). */
  async upcoming(hours: number, take = 300): Promise<EventSummaryDto[]> {
    return this.summaries(
      { status: 'SCHEDULED', startTime: { lt: new Date(Date.now() + hours * HOUR) } },
      [{ startTime: 'asc' }],
      take,
    );
  }

  /** F1.6 — every live match. */
  async live(): Promise<EventSummaryDto[]> {
    return this.summaries({ status: 'LIVE' }, [{ competition: { sortOrder: 'asc' } }, { startTime: 'asc' }], 100);
  }

  /** F1.9 — match page with every visible market. */
  async event(id: string): Promise<EventDetailDto> {
    const visible = await this.visibleMarkets();
    const e = await this.prisma.event.findFirst({
      where: { id, competition: { enabled: true, active: true } },
      include: {
        competition: true,
        markets: { where: visible, include: marketInclude, orderBy: { sortOrder: 'asc' } },
        _count: { select: { markets: { where: visible } } },
      },
    });
    if (!e) throw new DomainError('NOT_FOUND');
    return toDetail(e);
  }

  async search(q: string) {
    const term = q.trim();
    if (term.length < 2) return { competitions: [], events: [] };
    const contains = { contains: term, mode: 'insensitive' as const };
    const [competitions, events] = await Promise.all([
      this.prisma.competition.findMany({ where: { enabled: true, active: true, OR: [{ name: contains }, { country: contains }] }, take: 10 }),
      this.summaries({ OR: [{ homeTeam: contains }, { awayTeam: contains }, { competition: { name: contains } }] }, [{ startTime: 'asc' }], 30),
    ]);
    return { competitions: competitions.map(toCompetition), events };
  }

  /** Bet slip refresh: current price and availability of the selections the player picked. */
  async selections(ids: string[]) {
    const disabled = new Set(await this.disabledMarketTypes());
    const rows = await this.prisma.selection.findMany({
      where: { id: { in: ids.slice(0, 50) } },
      include: { boost: true, market: { include: { event: { include: { competition: { select: { enabled: true, active: true } } } } } } },
    });
    const now = Date.now();
    return rows.map((s) => {
      const { market } = s;
      const { event } = market;
      const eventOpen =
        event.competition.enabled && event.competition.active && (event.status === 'LIVE' || (event.status === 'SCHEDULED' && event.startTime.getTime() > now));
      return {
        id: s.id,
        oddsMilli: toSelection(s).oddsMilli,
        available:
          eventOpen &&
          !event.suspended &&
          !event.feedSuspended &&
          market.enabled &&
          market.status === 'OPEN' &&
          !disabled.has(market.type) &&
          s.active,
        live: event.status === 'LIVE',
      };
    });
  }
}

