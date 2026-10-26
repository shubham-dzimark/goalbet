import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';

/** Redis pub/sub channels shared by API instances and workers (F5.10). */
export const Channels = {
  /** Odds / score / market status changes for events: payload LiveEventUpdate */
  EVENT_UPDATES: 'gb:event-updates',
  /** Per-user ticket updates (status, cash-out offers): payload { userId, ... } */
  TICKET_UPDATES: 'gb:ticket-updates',
  /** Wallet balance changes: payload { userId, balanceBani, heldBani } */
  WALLET_UPDATES: 'gb:wallet-updates',
  /** Deposit / withdrawal request status changes: payload PaymentMessage */
  PAYMENT_UPDATES: 'gb:payment-updates',
  /** Settings changed by an admin: payload { key } */
  SETTINGS_CHANGED: 'gb:settings-changed',
} as const;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  private subscriber: Redis | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
    this.client.on('error', (e) => this.logger.warn(`redis error: ${e.message}`));
  }

  /** Separate connection for subscriptions (a subscribed connection cannot run commands). */
  createSubscriber(): Redis {
    const sub = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    sub.on('error', (e) => this.logger.warn(`redis sub error: ${e.message}`));
    return sub;
  }

  async publish(channel: string, payload: unknown) {
    await this.client.publish(channel, JSON.stringify(payload));
  }

  async subscribe(channel: string, handler: (payload: unknown) => void) {
    this.subscriber ??= this.createSubscriber();
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch, msg) => {
      if (ch !== channel) return;
      try {
        handler(JSON.parse(msg));
      } catch (e) {
        this.logger.warn(`bad message on ${ch}: ${(e as Error).message}`);
      }
    });
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.client.quit(), this.subscriber?.quit()]);
  }
}
