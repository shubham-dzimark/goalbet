import { Injectable } from '@nestjs/common';
import { type EventStatus, type MarketType, type Prisma } from '@goalbet/db';
import {
  type AdminCompetitionRow,
  type AdminEventRow,
  type AdminMarketRow,
  type AdminMarketTypeRow,
  type AdminSettings,
  type EventStateMessage,
  MARKET_TYPES,
  OPEN_TICKET_STATUSES,
  type OddsMessage,
  SETTING_DEFAULTS,
  type SettingKey,
  parseLineCenti,
  parseOddsMilli,
} from '@goalbet/shared';
import { type Actor, AuditService } from '../../common/audit.service.js';
import { DomainError } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { Channels, RedisService } from '../../common/redis.service.js';
import { SettingsService } from '../../common/settings.service.js';

/**
 * F3.5 sportsbook settings: leagues, market types, single markets, event suspension and the
 * betting limits. Every switch is audited and pushed to connected clients (EVENT_UPDATES).
 */
@Injectable()
export class AdminSportsbookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
  ) {}

  // ── leagues ──
  async competitions(): Promise<AdminCompetitionRow[]> {
    const now = new Date();
    const [comps, upcoming, live] = await Promise.all([
      this.prisma.competition.findMany({ orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.event.groupBy({ by: ['competitionId'], where: { status: 'SCHEDULED', startTime: { gt: now } }, _count: true }),
      this.prisma.event.groupBy({ by: ['competitionId'], where: { status: 'LIVE' }, _count: true }),
    ]);
    const up = new Map(upcoming.map((g) => [g.competitionId, g._count]));
    const lv = new Map(live.map((g) => [g.competitionId, g._count]));
    return comps.map((c) => ({
      id: c.id,
      name: c.name,
      country: c.country,
      countryCode: c.countryCode,
      enabled: c.enabled,
      isTop: c.isTop,
      active: c.active,
      sortOrder: c.sortOrder,
      upcoming: up.get(c.id) ?? 0,
      live: lv.get(c.id) ?? 0,
    }));
  }

  async updateCompetition(actor: Actor, id: string, patch: { enabled?: boolean | undefined; isTop?: boolean | undefined; sortOrder?: number | undefined }) {
    const before = await this.prisma.competition.findUnique({ where: { id }, select: { enabled: true, isTop: true, sortOrder: true, name: true } });
    if (!before) throw new DomainError('NOT_FOUND');
    const data = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Prisma.CompetitionUpdateInput;
    await this.prisma.$transaction(async (tx) => {
      await tx.competition.update({ where: { id }, data });
      await this.audit.log(
        { category: 'ADMIN', action: 'COMPETITION_UPDATED', actor, entityType: 'Competition', entityId: id, before, after: data, meta: { name: before.name } },
        tx,
      );
    });
    return (await this.competitions()).find((c) => c.id === id);
  }

  // ── market types ──
  async marketTypes(): Promise<AdminMarketTypeRow[]> {
    const [settings, open] = await Promise.all([
      this.prisma.marketTypeSetting.findMany(),
      this.prisma.market.groupBy({ by: ['type'], where: { status: 'OPEN' }, _count: true }),
    ]);
    const enabled = new Map(settings.map((s) => [s.type, s.enabled]));
    const counts = new Map(open.map((g) => [g.type, g._count]));
    return (MARKET_TYPES as MarketType[]).map((type) => ({ type, enabled: enabled.get(type) ?? true, openMarkets: counts.get(type) ?? 0 }));
  }

  async setMarketType(actor: Actor, type: MarketType, enabled: boolean) {
    const before = await this.prisma.marketTypeSetting.findUnique({ where: { type } });
    await this.prisma.$transaction(async (tx) => {
      await tx.marketTypeSetting.upsert({ where: { type }, create: { type, enabled }, update: { enabled } });
      await this.audit.log(
        { category: 'ADMIN', action: enabled ? 'MARKET_TYPE_ENABLED' : 'MARKET_TYPE_DISABLED', actor, entityType: 'MarketType', entityId: type, before: { enabled: before?.enabled ?? true }, after: { enabled } },
        tx,
      );
    });
    return this.marketTypes();
  }

  // ── events ──
  async events(q: {
    competitionId?: string | undefined;
    status?: EventStatus | undefined;
    q?: string | undefined;
    suspendedOnly?: boolean | undefined;
    cursor?: string | undefined;
    limit: number;
  }) {
    const term = q.q?.trim();
    const contains = { contains: term, mode: 'insensitive' as const };
    const where: Prisma.EventWhereInput = {
      // leagues of the current provider only (switching provider leaves the old leagues inactive)
      ...(q.competitionId ? { competitionId: q.competitionId } : { competition: { active: true } }),
      ...(q.suspendedOnly ? { suspended: true } : {}),
      AND: [
        // default view: live, plus upcoming (a match the feed never started drops out 2 h after kick-off)
        q.status ? { status: q.status } : { OR: [{ status: 'LIVE' }, { status: 'SCHEDULED', startTime: { gte: new Date(Date.now() - 2 * 3600_000) } }] },
        term ? { OR: [{ homeTeam: contains }, { awayTeam: contains }] } : {},
      ],
    };
    const rows = await this.prisma.event.findMany({
      where,
      include: {
        competition: { select: { id: true, name: true, countryCode: true } },
        _count: { select: { markets: true, legs: { where: { ticket: { status: { in: OPEN_TICKET_STATUSES } } } } } },
      },
      // live first (enum order SCHEDULED < LIVE, so descending), then by kick-off
      orderBy: [{ status: 'desc' }, { startTime: 'asc' }, { id: 'asc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const items: AdminEventRow[] = rows.slice(0, q.limit).map((e) => ({
      id: e.id,
      competition: e.competition,
      homeTeam: e.homeTeam,
      awayTeam: e.awayTeam,
      startTime: e.startTime.toISOString(),
      status: e.status,
      minute: e.minute,
      homeScore: e.homeScore,
      awayScore: e.awayScore,
      suspended: e.suspended,
      feedSuspended: e.feedSuspended,
      markets: e._count.markets,
      openTickets: e._count.legs,
    }));
    return { items, nextCursor: rows.length > q.limit ? (items.at(-1)?.id ?? null) : null };
  }

  /** Suspend / resume a whole event: no bets are accepted while suspended (F1.13 EVENT_SUSPENDED). */
  async suspendEvent(actor: Actor, id: string, suspended: boolean, reason: string) {
    const ev = await this.prisma.event.findUnique({ where: { id } });
    if (!ev) throw new DomainError('NOT_FOUND');
    if (ev.suspended !== suspended) {
      await this.prisma.$transaction(async (tx) => {
        await tx.event.update({ where: { id }, data: { suspended } });
        await this.audit.log(
          {
            category: 'ADMIN',
            action: suspended ? 'EVENT_SUSPENDED' : 'EVENT_RESUMED',
            actor,
            entityType: 'Event',
            entityId: id,
            before: { suspended: ev.suspended },
            after: { suspended },
            meta: { reason, match: `${ev.homeTeam} – ${ev.awayTeam}` },
          },
          tx,
        );
      });
      const msg: EventStateMessage = {
        type: 'event',
        eventId: id,
        status: ev.status,
        period: ev.period,
        minute: ev.minute,
        homeScore: ev.homeScore,
        awayScore: ev.awayScore,
        corners: ev.corners,
        cards: ev.cards,
        suspended: suspended || ev.feedSuspended,
      };
      await this.redis.publish(Channels.EVENT_UPDATES, msg);
    }
    return { id, suspended };
  }

  async markets(eventId: string): Promise<AdminMarketRow[]> {
    const markets = await this.prisma.market.findMany({
      where: { eventId },
      include: { selections: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }],
    });
    return markets.map((m) => ({
      id: m.id,
      type: m.type,
      period: m.period,
      lineCenti: parseLineCenti(m.line),
      playerName: m.playerName,
      status: m.status,
      enabled: m.enabled,
      adminSuspended: m.adminSuspended,
      selections: m.selections.map((s) => ({ id: s.id, outcome: s.outcome, label: s.label, oddsMilli: parseOddsMilli(s.odds), active: s.active })),
    }));
  }

  /** Hide/show (enabled) or suspend/resume one market; an operator suspension holds against the feed. */
  async updateMarket(actor: Actor, id: string, patch: { enabled?: boolean | undefined; suspended?: boolean | undefined; reason: string }) {
    const m = await this.prisma.market.findUnique({ where: { id }, include: { event: { select: { homeTeam: true, awayTeam: true } } } });
    if (!m) throw new DomainError('NOT_FOUND');
    if (m.status === 'SETTLED') throw new DomainError('MARKET_SUSPENDED');
    const data: Prisma.MarketUpdateInput = {};
    if (patch.enabled !== undefined) data.enabled = patch.enabled;
    if (patch.suspended !== undefined) {
      data.adminSuspended = patch.suspended;
      data.status = patch.suspended ? 'SUSPENDED' : 'OPEN';
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.market.update({ where: { id }, data });
      await this.audit.log(
        {
          category: 'ADMIN',
          action: 'MARKET_UPDATED',
          actor,
          entityType: 'Market',
          entityId: id,
          before: { enabled: m.enabled, adminSuspended: m.adminSuspended, status: m.status },
          after: data,
          meta: { reason: patch.reason, market: m.key, match: `${m.event.homeTeam} – ${m.event.awayTeam}` },
        },
        tx,
      );
    });
    if (data.status) {
      const msg: OddsMessage = { type: 'odds', eventId: m.eventId, selections: [], markets: [{ marketId: id, status: data.status as 'OPEN' | 'SUSPENDED' }] };
      await this.redis.publish(Channels.EVENT_UPDATES, msg);
    }
    return (await this.markets(m.eventId)).find((x) => x.id === id);
  }

  // ── betting limits & sportsbook settings ──
  async getSettings(): Promise<AdminSettings> {
    const [values, rows] = await Promise.all([this.settings.all(), this.prisma.setting.findMany({ select: { key: true, updatedAt: true } })]);
    return { values, updatedAt: Object.fromEntries(rows.map((r) => [r.key, r.updatedAt.toISOString()])) };
  }

  async updateSetting(actor: Actor, key: SettingKey, value: number | boolean) {
    if (typeof value !== typeof SETTING_DEFAULTS[key]) throw new DomainError('VALIDATION_FAILED', { key });
    const values = await this.settings.all();
    // keep the limits consistent with each other
    if (key === 'betting.minStakeBani' && (value as number) > values['betting.maxStakeBani']) throw new DomainError('VALIDATION_FAILED', { key });
    if (key === 'betting.maxStakeBani' && (value as number) < values['betting.minStakeBani']) throw new DomainError('VALIDATION_FAILED', { key });
    if (key === 'betting.maxAccaLegs' && ((value as number) < 2 || (value as number) > 30)) throw new DomainError('VALIDATION_FAILED', { key });
    await this.settings.set(key, value as never, actor);
    return this.getSettings();
  }
}
