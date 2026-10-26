import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { type ActorType, type AuditCategory, type Prisma } from '@goalbet/db';
import { adminAuditQuerySchema, adminReportQuerySchema } from '@goalbet/shared';
import { AdminAuthGuard } from '../../common/auth/guards.js';
import { PrismaService } from '../../common/prisma.service.js';
import { ZQuery } from '../../common/zod.js';
import { AdminReportsService, toAuditRow } from './admin-reports.service.js';

const day = (d: string) => new Date(`${d}T00:00:00Z`);

/** Dashboard, F3.6 reports and F3.8 audit logs (read-only, any admin). */
@ApiTags('admin-reports')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminReportsController {
  constructor(
    private readonly reports: AdminReportsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.reports.dashboard();
  }

  @Get('reports')
  report(@ZQuery(adminReportQuerySchema) q: z.output<typeof adminReportQuerySchema>) {
    return this.reports.report(q);
  }

  /** F3.8: every admin action, wallet change, betting event and system event. */
  @Get('audit')
  async audit(@ZQuery(adminAuditQuerySchema) q: z.output<typeof adminAuditQuerySchema>) {
    const term = q.q?.trim();
    const where: Prisma.AuditLogWhereInput = {
      ...(q.category ? { category: q.category as AuditCategory } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.actorType ? { actorType: q.actorType as ActorType } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(term ? { OR: [{ actorLabel: { contains: term, mode: 'insensitive' } }, { entityId: term }, { action: { contains: term.toUpperCase() } }] } : {}),
      ...(q.from || q.to
        ? { createdAt: { ...(q.from ? { gte: day(q.from) } : {}), ...(q.to ? { lt: new Date(day(q.to).getTime() + 86_400_000) } : {}) } }
        : {}),
    };
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, q.limit).map(toAuditRow);
    return { items, nextCursor: rows.length > q.limit ? (items.at(-1)?.id ?? null) : null };
  }

  /** Distinct actions per category, for the audit filter. */
  @Get('audit/actions')
  async actions() {
    const rows = await this.prisma.auditLog.groupBy({ by: ['category', 'action'], _count: true, orderBy: { action: 'asc' } });
    return rows.map((r) => ({ category: r.category, action: r.action, count: r._count }));
  }
}
