import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, PrismaPg } from '@goalbet/db';
import { ENV, type Env } from '../config/env.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: env.DATABASE_POOL_MAX }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
