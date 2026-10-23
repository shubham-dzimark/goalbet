import { Controller, Get, Headers, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type z } from 'zod';
import { placeBetSchema, ticketListQuerySchema } from '@goalbet/shared';
import { type AuthedUser, CurrentUser, UserAuthGuard } from '../../common/auth/guards.js';
import { ReqMeta, type RequestMeta } from '../../common/request-meta.js';
import { ZBody, ZQuery } from '../../common/zod.js';
import { BetService } from './bet.service.js';
import { TicketsService } from './tickets.service.js';

@ApiTags('betting')
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller()
export class BetsController {
  constructor(
    private readonly bets: BetService,
    private readonly tickets: TicketsService,
  ) {}

  /** F1.13–F1.15 — place a single or accumulator. Requires an Idempotency-Key header (rule 5). */
  @Post('bets')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  place(
    @CurrentUser() u: AuthedUser,
    @Headers('idempotency-key') key: string | undefined,
    @ZBody(placeBetSchema) body: z.output<typeof placeBetSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.bets.place(u.id, key, body, { type: 'USER', id: u.id, ...meta });
  }

  /** F1.7 — My Bets tabs. */
  @Get('tickets')
  list(@CurrentUser() u: AuthedUser, @ZQuery(ticketListQuerySchema) q: z.output<typeof ticketListQuerySchema>) {
    return this.tickets.list(u.id, q.tab, q.limit, q.cursor);
  }

  @Get('tickets/counts')
  counts(@CurrentUser() u: AuthedUser) {
    return this.tickets.counts(u.id);
  }

  @Get('tickets/:id')
  detail(@CurrentUser() u: AuthedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tickets.detail(u.id, id);
  }
}
