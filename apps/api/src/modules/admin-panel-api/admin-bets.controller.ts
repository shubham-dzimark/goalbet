import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { type Prisma, type TicketStatus } from '@goalbet/db';
import { type AdminTicketRow, OPEN_TICKET_STATUSES, SETTLED_TICKET_STATUSES, adminTicketQuerySchema } from '@goalbet/shared';
import { AdminAuthGuard } from '../../common/auth/guards.js';
import { DomainError } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { ZQuery } from '../../common/zod.js';
import { ticketInclude, toTicketDto } from '../bet-processing/ticket.mapper.js';

const VIEWS: Record<string, TicketStatus[] | null> = {
  all: null,
  open: OPEN_TICKET_STATUSES,
  live: ['LIVE'],
  settled: SETTLED_TICKET_STATUSES,
  cashout: ['CASHED_OUT'],
};
const day = (d: string) => new Date(`${d}T00:00:00Z`);
const include = { ...ticketInclude, user: { select: { id: true, name: true, email: true } } } satisfies Prisma.TicketInclude;

/** F3.4 bet management: every ticket, live / settled / cash outs, won / lost / void. Read-only. */
@ApiTags('admin-bets')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/tickets')
export class AdminBetsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@ZQuery(adminTicketQuerySchema) q: z.output<typeof adminTicketQuerySchema>) {
    const view = VIEWS[q.view];
    const term = q.q?.trim();
    const where: Prisma.TicketWhereInput = {
      ...(q.status ? { status: q.status as TicketStatus } : view ? { status: { in: view } } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(term
        ? { OR: [{ code: term.toUpperCase() }, { user: { email: { contains: term, mode: 'insensitive' } } }] }
        : {}),
      ...(q.from || q.to
        ? { placedAt: { ...(q.from ? { gte: day(q.from) } : {}), ...(q.to ? { lt: new Date(day(q.to).getTime() + 86_400_000) } : {}) } }
        : {}),
    };
    const rows = await this.prisma.ticket.findMany({
      where,
      include,
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const items: AdminTicketRow[] = rows.slice(0, q.limit).map((t) => ({ ...toTicketDto(t), user: t.user }));
    return { items, nextCursor: rows.length > q.limit ? (items.at(-1)?.id ?? null) : null };
  }

  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    const t = await this.prisma.ticket.findUnique({
      where: { id },
      include: { ...include, transactions: { orderBy: { createdAt: 'asc' } } },
    });
    if (!t) throw new DomainError('NOT_FOUND');
    return {
      ...toTicketDto(t),
      user: t.user,
      rejectReason: t.rejectReason,
      voidReason: t.voidReason,
      transactions: t.transactions.map((x) => ({
        id: x.id,
        type: x.type,
        amountBani: x.amountBani,
        balanceAfterBani: x.balanceAfterBani,
        reason: x.reason,
        createdAt: x.createdAt.toISOString(),
      })),
    };
  }
}
