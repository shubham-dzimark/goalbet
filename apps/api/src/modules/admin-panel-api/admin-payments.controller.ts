import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { adminPaymentApproveSchema, adminPaymentQuerySchema, adminPaymentRejectSchema } from '@goalbet/shared';
import { AdminAuthGuard, type AuthedAdmin, CurrentAdmin, Roles } from '../../common/auth/guards.js';
import { ReqMeta, type RequestMeta } from '../../common/request-meta.js';
import { ZBody, ZQuery } from '../../common/zod.js';
import { PaymentsService } from '../wallet-ledger/payments.service.js';
import { actorOf } from './admin-actor.js';

/** F3.3 deposit / withdrawal requests: any admin can view; FINANCE approves or rejects. */
@ApiTags('admin-payments')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/payment-requests')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list(@ZQuery(adminPaymentQuerySchema) q: z.output<typeof adminPaymentQuerySchema>) {
    return this.payments.adminList(q);
  }

  @Post(':id/approve')
  @Roles('FINANCE')
  @HttpCode(200)
  approve(
    @CurrentAdmin() admin: AuthedAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @ZBody(adminPaymentApproveSchema) body: z.output<typeof adminPaymentApproveSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.payments.approve({ ...actorOf(admin, meta), id: admin.id }, id, body.note);
  }

  @Post(':id/reject')
  @Roles('FINANCE')
  @HttpCode(200)
  reject(
    @CurrentAdmin() admin: AuthedAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @ZBody(adminPaymentRejectSchema) body: z.output<typeof adminPaymentRejectSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.payments.reject({ ...actorOf(admin, meta), id: admin.id }, id, body.note);
  }
}
