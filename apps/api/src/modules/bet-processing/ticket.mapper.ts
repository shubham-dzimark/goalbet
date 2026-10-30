import { type Prisma } from '@goalbet/db';
import { type TicketDto, parseLineCenti, parseOddsMilli } from '@goalbet/shared';

export const ticketInclude = {
  legs: {
    orderBy: { sortOrder: 'asc' },
    include: {
      event: { include: { competition: { select: { name: true } } } },
      selections: { include: { selection: { include: { market: true } } } },
    },
  },
} satisfies Prisma.TicketInclude;

export type TicketRow = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

export function toTicketDto(t: TicketRow): TicketDto {
  return {
    id: t.id,
    code: t.code,
    type: t.type,
    status: t.status,
    stakeBani: t.stakeBani,
    totalOddsMilli: parseOddsMilli(t.totalOdds),
    potentialWinBani: t.potentialWinBani,
    payoutBani: t.payoutBani,
    cashedOutBani: t.cashedOutBani,
    isLive: t.isLive,
    oddsChangePreference: t.oddsChangePreference,
    placedAt: t.placedAt.toISOString(),
    settledAt: t.settledAt?.toISOString() ?? null,
    cashedOutAt: t.cashedOutAt?.toISOString() ?? null,
    legs: t.legs.map((l) => ({
      id: l.id,
      kind: l.kind,
      oddsMilli: parseOddsMilli(l.oddsAtPlacement),
      status: l.status,
      event: {
        id: l.event.id,
        homeTeam: l.event.homeTeam,
        awayTeam: l.event.awayTeam,
        homeLogo: l.event.homeLogo,
        awayLogo: l.event.awayLogo,
        startTime: l.event.startTime.toISOString(),
        status: l.event.status,
        minute: l.event.minute,
        homeScore: l.event.homeScore,
        awayScore: l.event.awayScore,
        competition: l.event.competition.name,
      },
      selections: l.selections.map((s) => ({
        selectionId: s.selectionId,
        marketType: s.selection.market.type,
        marketPeriod: s.selection.market.period,
        line: parseLineCenti(s.selection.market.line),
        team: s.selection.market.team,
        playerName: s.selection.market.playerName,
        outcome: s.selection.outcome,
        label: s.selection.label,
        oddsMilli: parseOddsMilli(s.oddsAtPlacement),
        result: s.result,
      })),
    })),
  };
}
