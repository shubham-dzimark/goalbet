import { Injectable } from '@nestjs/common';
import { type ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from './redis.service.js';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/** Redis-backed rate-limit counters so limits hold across horizontally scaled API instances. */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `${hitKey}:blocked`;
    const r = this.redis.client;

    const blockTtl = await r.pttl(blockKey);
    if (blockTtl > 0) {
      return { totalHits: limit + 1, timeToExpire: Math.ceil(blockTtl / 1000), isBlocked: true, timeToBlockExpire: Math.ceil(blockTtl / 1000) };
    }

    const [[, hits], [, pttl]] = (await r.multi().incr(hitKey).pttl(hitKey).exec()) as [[null, number], [null, number]];
    if (pttl < 0) await r.pexpire(hitKey, ttl);
    const timeToExpire = Math.ceil((pttl < 0 ? ttl : pttl) / 1000);

    if (hits > limit) {
      await r.set(blockKey, '1', 'PX', blockDuration);
      return { totalHits: hits, timeToExpire, isBlocked: true, timeToBlockExpire: Math.ceil(blockDuration / 1000) };
    }
    return { totalHits: hits, timeToExpire, isBlocked: false, timeToBlockExpire: 0 };
  }
}
