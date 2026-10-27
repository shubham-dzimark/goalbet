import { randomInt } from 'node:crypto';
import { oddsToDecimalString } from '@goalbet/shared';
import { type TestContext } from './helpers.js';

/** Deterministic sportsbook rows for betting tests (no provider involved). */
export async function seedEvent(
  ctx: TestContext,
  opts: { status?: 'SCHEDULED' | 'LIVE'; startInMin?: number; odds?: [number, number, number]; competitionId?: string } = {},
) {
  const n = randomInt(1_000_000_000);
  const competitionId =
    opts.competitionId ??
    (
      await ctx.prisma.competition.create({
        data: { providerRef: `t-comp-${n}`, name: `Test League ${n}`, country: 'Test', countryCode: 'TT', isTop: true },
      })
    ).id;
  const [h, d, a] = opts.odds ?? [2000, 3200, 3800];
  const event = await ctx.prisma.event.create({
    data: {
      providerRef: `t-ev-${n}`,
      competitionId,
      homeTeam: `Home ${n}`,
      awayTeam: `Away ${n}`,
      startTime: new Date(Date.now() + (opts.startInMin ?? 120) * 60_000),
      status: opts.status ?? 'SCHEDULED',
      minute: opts.status === 'LIVE' ? 30 : null,
      period: opts.status === 'LIVE' ? 'FIRST_HALF' : 'NOT_STARTED',
      markets: {
        create: {
          key: 'MATCH_RESULT|FT||||',
          type: 'MATCH_RESULT',
          period: 'FT',
          selections: {
            create: [
              { outcome: 'HOME', odds: oddsToDecimalString(h), sortOrder: 0 },
              { outcome: 'DRAW', odds: oddsToDecimalString(d), sortOrder: 1 },
              { outcome: 'AWAY', odds: oddsToDecimalString(a), sortOrder: 2 },
            ],
          },
        },
      },
    },
    include: { markets: { include: { selections: { orderBy: { sortOrder: 'asc' } } } } },
  });
  const market = event.markets[0]!;
  const [home, draw, away] = market.selections;
  return { competitionId, event, market, home: home!, draw: draw!, away: away! };
}

/** Goals markets for Bet Builder tests: Over/Under 2.5 (1.90 / 1.90) and BTTS (1.80 / 2.00). */
export async function seedGoalMarkets(ctx: TestContext, eventId: string) {
  const ou = await ctx.prisma.market.create({
    data: {
      eventId,
      key: 'TOTAL_GOALS|FT|250||',
      type: 'TOTAL_GOALS',
      period: 'FT',
      line: '2.50',
      selections: { create: [{ outcome: 'OVER', odds: '1.900', sortOrder: 0 }, { outcome: 'UNDER', odds: '1.900', sortOrder: 1 }] },
    },
    include: { selections: { orderBy: { sortOrder: 'asc' } } },
  });
  const btts = await ctx.prisma.market.create({
    data: {
      eventId,
      key: 'BTTS|FT|||',
      type: 'BTTS',
      period: 'FT',
      selections: { create: [{ outcome: 'YES', odds: '1.800', sortOrder: 0 }, { outcome: 'NO', odds: '2.000', sortOrder: 1 }] },
    },
    include: { selections: { orderBy: { sortOrder: 'asc' } } },
  });
  return { over: ou.selections[0]!, under: ou.selections[1]!, bttsYes: btts.selections[0]!, bttsNo: btts.selections[1]! };
}

/** Credit a player directly through the ledger (bypasses admin approval, for setup only). */
export async function fund(ctx: TestContext, userId: string, bani: number) {
  const { WalletService } = await import('../src/modules/wallet-ledger/wallet.service.js');
  const wallet = ctx.app.get(WalletService);
  await ctx.prisma.$transaction((tx) =>
    wallet.apply(tx, { userId, type: 'ADMIN_CREDIT', amountBani: bani, reason: 'test funding', actor: { type: 'SYSTEM' } }),
  );
}

export async function setSetting(ctx: TestContext, key: string, value: number | boolean) {
  await ctx.prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  const { SettingsService } = await import('../src/common/settings.service.js');
  // drop the in-memory cache
  (ctx.app.get(SettingsService) as unknown as { cache: unknown }).cache = null;
}

let keyN = 0;
export const idemKey = () => `test-key-${Date.now()}-${keyN++}`;
