import { type AddressInfo } from 'node:net';
import { type Socket, io } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type EventStateMessage, type TicketMessage, type WalletMessage } from '@goalbet/shared';
import { Channels } from '../src/common/redis.service.js';
import { IngestService } from '../src/modules/odds-management/ingest.service.js';
import { fund, idemKey, seedEvent, setSetting } from './fixtures.js';
import { type TestContext, createTestApp, registerPlayer, resetDb } from './helpers.js';

let ctx: TestContext;
let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  ctx = await createTestApp();
  await ctx.app.listen(0, '127.0.0.1');
  url = `http://127.0.0.1:${(ctx.app.getHttpServer().address() as AddressInfo).port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await ctx.close();
});
beforeEach(async () => resetDb(ctx));

async function connect(token?: string) {
  const s = io(url, { transports: ['websocket'], auth: token ? { token } : {}, forceNew: true });
  sockets.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once('connect', () => resolve());
    s.once('connect_error', reject);
  });
  return s;
}
const watch = (s: Socket, body: { live?: boolean; eventIds?: string[] }) => s.emitWithAck('watch', body);
/** Resolves with the next message of `type`, or null after `ms`. */
const next = <T>(s: Socket, type: string, ms = 1_500) =>
  new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    s.once(type, (m: T) => {
      clearTimeout(timer);
      resolve(m);
    });
  });
const placeSingle = (token: string, selectionId: string, oddsMilli: number, stakeBani = 1000) =>
  ctx
    .http()
    .post('/bets')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', idemKey())
    .send({ type: 'SINGLE', stakeBani, oddsChangePreference: 'ANY', legs: [{ kind: 'SELECTION', selectionId, oddsMilli }] });

const liveState = (ref: string) => ({
  ref,
  status: 'LIVE' as const,
  period: 'FIRST_HALF' as const,
  minute: 3,
  homeScore: 0,
  awayScore: 0,
  htHomeScore: null,
  htAwayScore: null,
  corners: 0,
  cards: 0,
  suspended: false,
});

describe('F1.6 / F2.2 WebSocket push', () => {
  it('delivers match updates to the live room and that match’s room only', async () => {
    const { event } = await seedEvent(ctx, { status: 'LIVE', startInMin: -20 });
    const other = await seedEvent(ctx);
    const live = await connect();
    const match = await connect();
    const elsewhere = await connect();
    await watch(live, { live: true });
    await watch(match, { eventIds: [event.id] });
    await watch(elsewhere, { eventIds: [other.event.id] });

    const msg: EventStateMessage = { type: 'event', eventId: event.id, status: 'LIVE', period: 'FIRST_HALF', minute: 31, homeScore: 1, awayScore: 0, corners: 2, cards: 0, suspended: false };
    const got = [next<EventStateMessage>(live, 'event'), next<EventStateMessage>(match, 'event'), next<EventStateMessage>(elsewhere, 'event', 600)];
    await ctx.redis.publish(Channels.EVENT_UPDATES, msg);
    const [a, b, c] = await Promise.all(got);
    expect(a).toMatchObject({ eventId: event.id, homeScore: 1, minute: 31 });
    expect(b).toMatchObject({ eventId: event.id, homeScore: 1 });
    expect(c).toBeNull();
  });

  it('sends a player their own balance changes only when the socket is authenticated', async () => {
    const p = await registerPlayer(ctx, 701);
    const mine = await connect(p.token);
    const anon = await connect();
    const got = [next<WalletMessage>(mine, 'wallet'), next<WalletMessage>(anon, 'wallet', 600)];
    await fund(ctx, p.id, 5_000);
    const { WalletService } = await import('../src/modules/wallet-ledger/wallet.service.js');
    await ctx.app.get(WalletService).publishBalance(p.id);
    const [m, a] = await Promise.all(got);
    expect(m).toMatchObject({ userId: p.id, balanceBani: 5_000 });
    expect(a).toBeNull();

    // logging out on the socket stops private updates
    await mine.emitWithAck('auth', null);
    const after = next<WalletMessage>(mine, 'wallet', 600);
    await ctx.app.get(WalletService).publishBalance(p.id);
    expect(await after).toBeNull();
  });
});

describe('F2.1 kick-off: open tickets become LIVE', () => {
  it('flips ACTIVE tickets on the match to LIVE and tells the player', async () => {
    const p = await registerPlayer(ctx, 702);
    const { event, home } = await seedEvent(ctx, { startInMin: 1 });
    await fund(ctx, p.id, 5_000);
    const placed = await placeSingle(p.token, home.id, 2000).expect(201);
    expect(placed.body.status).toBe('ACTIVE');

    const s = await connect(p.token);
    const ticketMsg = next<TicketMessage>(s, 'ticket');
    const ingest = ctx.app.get(IngestService) as unknown as { applyLiveState: (id: string, from: string, st: ReturnType<typeof liveState>) => Promise<void> };
    await ingest.applyLiveState(event.id, 'SCHEDULED', liveState(event.providerRef));

    expect((await ctx.prisma.ticket.findUniqueOrThrow({ where: { id: placed.body.id } })).status).toBe('LIVE');
    expect(await ticketMsg).toMatchObject({ ticketId: placed.body.id, status: 'LIVE', userId: p.id });
    expect(await ctx.prisma.auditLog.count({ where: { action: 'TICKETS_WENT_LIVE', entityId: event.id } })).toBe(1);
  });
});

describe('F4.1 feed-stall safety', () => {
  it('suspends live matches when live data is too old, once, and refuses bets meanwhile', async () => {
    await setSetting(ctx, 'betting.liveDelayMs', 0);
    await setSetting(ctx, 'feed.stallSeconds', 30);
    const p = await registerPlayer(ctx, 703);
    await fund(ctx, p.id, 5_000);
    const { event, home } = await seedEvent(ctx, { status: 'LIVE', startInMin: -30 });
    const ingest = ctx.app.get(IngestService);

    await ctx.redis.client.set('feed:last-live-sync', String(Date.now() - 5_000));
    expect(await ingest.checkFeed()).toMatchObject({ stalled: false, suspended: 0 });

    const watcher = await connect();
    await watch(watcher, { eventIds: [event.id] });
    const pushed = next<EventStateMessage>(watcher, 'event');
    await ctx.redis.client.set('feed:last-live-sync', String(Date.now() - 120_000));
    expect(await ingest.checkFeed()).toMatchObject({ stalled: true, suspended: 1 });
    expect(await pushed).toMatchObject({ eventId: event.id, suspended: true });
    expect((await ctx.prisma.event.findUniqueOrThrow({ where: { id: event.id } })).feedSuspended).toBe(true);
    expect((await placeSingle(p.token, home.id, 2000)).body.error.code).toBe('EVENT_SUSPENDED');

    // still stale: nothing new to suspend, no duplicate audit entry
    expect(await ingest.checkFeed()).toMatchObject({ stalled: true, suspended: 0 });
    expect(await ctx.prisma.auditLog.count({ where: { action: 'FEED_STALLED' } })).toBe(1);

    // fresh data lifts it
    const recover = ctx.app.get(IngestService) as unknown as { applyLiveState: (id: string, from: string, st: ReturnType<typeof liveState>) => Promise<void> };
    await recover.applyLiveState(event.id, 'LIVE', liveState(event.providerRef));
    expect((await ctx.prisma.event.findUniqueOrThrow({ where: { id: event.id } })).feedSuspended).toBe(false);
  });

  it('no feed data at all counts as stalled', async () => {
    await seedEvent(ctx, { status: 'LIVE', startInMin: -10 });
    await ctx.redis.client.del('feed:last-live-sync');
    expect(await ctx.app.get(IngestService).checkFeed()).toMatchObject({ stalled: true, ageSeconds: null, suspended: 1 });
  });
});
