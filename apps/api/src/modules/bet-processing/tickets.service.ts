import { Injectable } from '@nestjs/common';
import { type Prisma } from '@goalbet/db';
import { OPEN_TICKET_STATUSES, type Page, type TicketDto } from '@goalbet/shared';
import { DomainError } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { ticketInclude, toTicketDto } from './ticket.mapper.js';

export type TicketTab = 'active' | 'settled' | 'cashout';

const TAB_WHERE: Record<TicketTab, Prisma.TicketWhereInput> = {
  active: { status: { in: OPEN_TICKET_STATUSES } },
  settled: { status: { in: ['WON', 'LOST', 'VOID'] } },
  cashout: { status: 'CASHED_OUT' },
};

/** F1.7 — My Bets: Active, Settled and Cash Out history, plus ticket detail. */
@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, tab: TicketTab, limit: number, cursor?: string): Promise<Page<TicketDto>> {
    const rows = await this.prisma.ticket.findMany({
      where: { userId, ...TAB_WHERE[tab] },
      include: ticketInclude,
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, limit).map(toTicketDto);
    return { items, nextCursor: rows.length > limit ? (items[items.length - 1]?.id ?? null) : null };
  }

  async counts(userId: string) {
    const [active, settled, cashout] = await Promise.all(
      (['active', 'settled', 'cashout'] as const).map((t) => this.prisma.ticket.count({ where: { userId, ...TAB_WHERE[t] } })),
    );
    return { active, settled, cashout };
  }

  async detail(userId: string, id: string): Promise<TicketDto> {
    const t = await this.prisma.ticket.findFirst({ where: { id, userId }, include: ticketInclude });
    if (!t) throw new DomainError('NOT_FOUND');
    return toTicketDto(t);
  }
}
