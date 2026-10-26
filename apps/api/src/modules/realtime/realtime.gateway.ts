import { Logger, type OnModuleInit } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ConnectedSocket, MessageBody, type OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { type EventMessage, type TicketMessage, type WalletMessage, rooms } from '@goalbet/shared';
import { TokensService } from '../../common/auth/tokens.service.js';
import { Channels, RedisService } from '../../common/redis.service.js';
import { loadEnv } from '../../config/env.js';

const env = loadEnv();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_WATCHED_EVENTS = 60;

interface ClientData {
  userId?: string;
}

/**
 * F1.6 / F2.2 real-time push (Socket.IO). Every API instance subscribes to the Redis channels
 * the ingest, betting and wallet code publish on and relays them to its own sockets:
 *  - `live` room: every match update (home and live pages),
 *  - `event:<id>` rooms: one match (match page, bet slip),
 *  - `user:<id>` rooms: that player's tickets and balance (needs the access token).
 * Clients only ever receive data; all betting still goes through the HTTP API.
 */
// the HTTP rate limiter (global guard) can't read socket messages; these only join/leave rooms
@SkipThrottle()
// no trailing slash: the web app reaches it through its /api proxy, and Next.js strips trailing slashes
@WebSocketGateway({ addTrailingSlash: false, cors: { origin: [env.WEB_ORIGIN, env.ADMIN_ORIGIN], credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnModuleInit {
  private readonly logger = new Logger('Realtime');
  @WebSocketServer() private readonly server?: Server;

  constructor(
    private readonly redis: RedisService,
    private readonly tokens: TokensService,
  ) {}

  async onModuleInit() {
    await this.redis.subscribe(Channels.EVENT_UPDATES, (m) => {
      const msg = m as EventMessage;
      this.server?.to(rooms.event(msg.eventId)).to(rooms.live).emit(msg.type, msg);
    });
    await this.redis.subscribe(Channels.TICKET_UPDATES, (m) => {
      const msg = m as TicketMessage;
      this.server?.to(rooms.user(msg.userId)).emit('ticket', msg);
    });
    await this.redis.subscribe(Channels.WALLET_UPDATES, (m) => {
      const msg = m as WalletMessage;
      this.server?.to(rooms.user(msg.userId)).emit('wallet', msg);
    });
  }

  handleConnection(client: Socket) {
    this.authenticate(client, (client.handshake.auth as { token?: unknown } | undefined)?.token);
  }

  /** (Re-)authenticate after login, logout or a token refresh; `null` leaves the player room. */
  @SubscribeMessage('auth')
  auth(@ConnectedSocket() client: Socket, @MessageBody() token: unknown) {
    return { userId: this.authenticate(client, token) };
  }

  /** Replace what this socket follows: all live updates and/or specific matches. */
  @SubscribeMessage('watch')
  async watch(@ConnectedSocket() client: Socket, @MessageBody() body: { live?: unknown; eventIds?: unknown } | undefined) {
    const eventIds = Array.isArray(body?.eventIds)
      ? [...new Set(body.eventIds.filter((id): id is string => typeof id === 'string' && UUID.test(id)))].slice(0, MAX_WATCHED_EVENTS)
      : [];
    for (const room of client.rooms) if (room === rooms.live || room.startsWith('event:')) await client.leave(room);
    if (body?.live === true) await client.join(rooms.live);
    for (const id of eventIds) await client.join(rooms.event(id));
    return { live: body?.live === true, events: eventIds.length };
  }

  private authenticate(client: Socket, token: unknown): string | null {
    const data = client.data as ClientData;
    if (data.userId) void client.leave(rooms.user(data.userId));
    data.userId = undefined;
    if (typeof token !== 'string' || !token) return null;
    try {
      const payload = this.tokens.verifyUser(token);
      data.userId = payload.sub;
      void client.join(rooms.user(payload.sub));
      return payload.sub;
    } catch {
      // an expired or invalid token only means no private updates; public rooms still work
      this.logger.debug('socket token rejected');
      return null;
    }
  }
}
