import { Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type z } from 'zod';
import { cashOutAcceptSchema } from '@goalbet/shared';
import { type AuthedUser, CurrentUser, UserAuthGuard } from '../../common/auth/guards.js';
import { ReqMeta, type RequestMeta } from '../../common/request-meta.js';
import { ZBody } from '../../common/zod.js';
import { CashOutService } from './cash-out.service.js';

/** F2.3–F2.7 cash out for the player's open tickets. */
@ApiTags('betting')
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller()
export class CashOutController {
  constructor(private readonly cashOut: CashOutService) {}

  /** Offers for every open ticket (My Bets). */
  @Get('cashout/offers')
  offers(@CurrentUser() u: AuthedUser) {
    return this.cashOut.quotes(u.id);
  }

  @Get('tickets/:id/cashout')
  quote(@CurrentUser() u: AuthedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cashOut.quote(u.id, id);
  }

  /** Accept the shown offer. Requires an Idempotency-Key header (rule 5). */
  @Post('tickets/:id/cashout')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  accept(
    @CurrentUser() u: AuthedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @ZBody(cashOutAcceptSchema) body: z.output<typeof cashOutAcceptSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.cashOut.accept(u.id, id, key, body.offerBani, { type: 'USER', id: u.id, ...meta });
  }
}
