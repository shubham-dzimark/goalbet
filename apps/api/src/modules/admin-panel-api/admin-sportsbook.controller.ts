import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { type EventStatus, type MarketType } from '@goalbet/db';
import {
  type SettingKey,
  adminCompetitionUpdateSchema,
  adminEventQuerySchema,
  adminEventSuspendSchema,
  adminMarketTypeUpdateSchema,
  adminMarketUpdateSchema,
  adminSettingUpdateSchema,
  adminSettleEventSchema,
} from '@goalbet/shared';
import { AdminAuthGuard, type AuthedAdmin, CurrentAdmin, Roles } from '../../common/auth/guards.js';
import { DomainError } from '../../common/errors.js';
import { ReqMeta, type RequestMeta } from '../../common/request-meta.js';
import { ZBody, ZQuery } from '../../common/zod.js';
import { SettlementService } from '../settlement-engine/settlement.service.js';
import { actorOf } from './admin-actor.js';
import { AdminSportsbookService } from './admin-sportsbook.service.js';

/**
 * F3.5 sportsbook settings: enable/disable leagues and markets, suspend events, manage limits.
 * Viewing: any admin. Changes: OPERATOR (SUPER_ADMIN always).
 */
@ApiTags('admin-sportsbook')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/sportsbook')
export class AdminSportsbookController {
  constructor(
    private readonly sportsbook: AdminSportsbookService,
    private readonly settlement: SettlementService,
  ) {}

  @Get('competitions')
  competitions() {
    return this.sportsbook.competitions();
  }

  @Patch('competitions/:id')
  @Roles('OPERATOR')
  updateCompetition(
    @CurrentAdmin() admin: AuthedAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @ZBody(adminCompetitionUpdateSchema) body: z.output<typeof adminCompetitionUpdateSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.sportsbook.updateCompetition(actorOf(admin, meta), id, body);
  }

  @Get('market-types')
  marketTypes() {
    return this.sportsbook.marketTypes();
  }

  @Put('market-types')
  @Roles('OPERATOR')
  setMarketType(
    @CurrentAdmin() admin: AuthedAdmin,
    @ZBody(adminMarketTypeUpdateSchema) body: z.output<typeof adminMarketTypeUpdateSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.sportsbook.setMarketType(actorOf(admin, meta), body.type as MarketType, body.enabled);
  }

  @Get('events')
  events(@ZQuery(adminEventQuerySchema) q: z.output<typeof adminEventQuerySchema>) {
    return this.sportsbook.events({ ...q, status: q.status as EventStatus | undefined });
  }

  @Post('events/:id/suspend')
  @Roles('OPERATOR')
  @HttpCode(200)
  suspendEvent(
    @CurrentAdmin() admin: AuthedAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @ZBody(adminEventSuspendSchema) body: z.output<typeof adminEventSuspendSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.sportsbook.suspendEvent(actorOf(admin, meta), id, body.suspended, body.reason);
  }

  /** F2.9 manual settlement with an entered result (when the provider has none). */
  @Post('events/:id/settle')
  @Roles('OPERATOR')
  @HttpCode(200)
  settleEvent(
    @CurrentAdmin() admin: AuthedAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @ZBody(adminSettleEventSchema) body: z.output<typeof adminSettleEventSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.settlement.settleManually(actorOf(admin, meta), id, body);
  }

  @Get('events/:id/markets')
  markets(@Param('id', ParseUUIDPipe) id: string) {
    return this.sportsbook.markets(id);
  }

  @Patch('markets/:id')
  @Roles('OPERATOR')
  updateMarket(
    @CurrentAdmin() admin: AuthedAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @ZBody(adminMarketUpdateSchema) body: z.output<typeof adminMarketUpdateSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.sportsbook.updateMarket(actorOf(admin, meta), id, body);
  }

  @Get('settings')
  settings() {
    return this.sportsbook.getSettings();
  }

  /** Betting/cash-out limits belong to OPERATOR; wallet.* and payments.* (money rules) to FINANCE. */
  @Put('settings')
  @Roles('OPERATOR', 'FINANCE')
  updateSetting(
    @CurrentAdmin() admin: AuthedAdmin,
    @ZBody(adminSettingUpdateSchema) body: z.output<typeof adminSettingUpdateSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    const owner = body.key.startsWith('wallet.') || body.key.startsWith('payments.') ? 'FINANCE' : 'OPERATOR';
    if (admin.role !== 'SUPER_ADMIN' && admin.role !== owner) throw new DomainError('FORBIDDEN');
    return this.sportsbook.updateSetting(actorOf(admin, meta), body.key as SettingKey, body.value);
  }
}
