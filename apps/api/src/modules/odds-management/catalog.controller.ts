import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CatalogService } from './catalog.service.js';

/** Public sportsbook catalogue — guests can browse (F1.1). */
@ApiTags('catalog')
@SkipThrottle()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('home')
  home() {
    return this.catalog.home();
  }

  @Get('summary')
  async summary() {
    return { liveCount: await this.catalog.liveCount() };
  }

  @Get('countries')
  countries() {
    return this.catalog.countries();
  }

  @Get('competitions/:id')
  competition(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.competition(id);
  }

  @Get('upcoming')
  upcoming(@Query('hours') hours?: string) {
    const h = Math.min(168, Math.max(1, Number(hours) || 24));
    return this.catalog.upcoming(h);
  }

  @Get('live')
  live() {
    return this.catalog.live();
  }

  @Get('events/:id')
  event(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.event(id);
  }

  @Get('selections')
  selections(@Query('ids') ids = '') {
    const list = ids.split(',').filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    return list.length ? this.catalog.selections(list) : [];
  }

  @Get('search')
  search(@Query('q') q = '') {
    return this.catalog.search(q.slice(0, 60));
  }
}
