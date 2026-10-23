import { Injectable } from '@nestjs/common';
import { oddsToDecimalString, parseOddsMilli } from '@goalbet/shared';
import { PrismaService } from '../../common/prisma.service.js';

const HOUR = 3600_000;
const TARGET = 4;
const BOOST_FACTOR = 1.15;

/**
 * Keeps the homepage "Boosted odds" row populated in demo/mock mode: the favourite of a few top
 * upcoming matches gets +15 %. Admin-managed boosts arrive with sportsbook settings (F3.5).
 */
@Injectable()
export class BoostService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDemoBoosts() {
    const now = new Date();
    const active = await this.prisma.oddsBoost.count({
      where: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], selection: { market: { event: { status: 'SCHEDULED', startTime: { gt: now } } } } },
    });
    if (active >= TARGET) return 0;
    const events = await this.prisma.event.findMany({
      where: {
        status: 'SCHEDULED',
        startTime: { gt: new Date(now.getTime() + HOUR), lt: new Date(now.getTime() + 48 * HOUR) },
        competition: { enabled: true, isTop: true },
        markets: { some: { type: 'MATCH_RESULT', period: 'FT', status: 'OPEN', selections: { none: { boost: { isNot: null } } } } },
      },
      include: { markets: { where: { type: 'MATCH_RESULT', period: 'FT' }, include: { selections: true } } },
      orderBy: { startTime: 'asc' },
      take: TARGET - active,
    });
    let created = 0;
    for (const e of events) {
      const fav = e.markets[0]?.selections
        .filter((s) => s.active && s.outcome !== 'DRAW')
        .sort((a, b) => parseOddsMilli(a.odds) - parseOddsMilli(b.odds))[0];
      if (!fav) continue;
      const boosted = Math.round((parseOddsMilli(fav.odds) * BOOST_FACTOR) / 10) * 10;
      await this.prisma.oddsBoost.create({
        data: { selectionId: fav.id, odds: oddsToDecimalString(boosted), expiresAt: e.startTime },
      });
      created++;
    }
    return created;
  }
}
