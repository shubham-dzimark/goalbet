import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../common/prisma.service.js';
import { RedisService } from '../../common/redis.service.js';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async health() {
    const [db, redis] = await Promise.allSettled([this.prisma.$queryRaw`SELECT 1`, this.redis.client.ping()]);
    return {
      status: db.status === 'fulfilled' && redis.status === 'fulfilled' ? 'ok' : 'degraded',
      db: db.status === 'fulfilled',
      redis: redis.status === 'fulfilled',
      time: new Date().toISOString(),
    };
  }
}
