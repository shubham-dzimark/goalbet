'use client';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { type Socket, io } from 'socket.io-client';
import { create } from 'zustand';
import { type EventStateMessage, type OddsMessage, type TicketMessage, type WalletMessage } from '@goalbet/shared';
import { useAuth } from './auth-store';
import { useSlip } from './slip-store';

/** Socket connection state (shown in the top bar; slows polling down while connected). */
export const useRealtime = create<{ connected: boolean }>(() => ({ connected: false }));

let socket: Socket | null = null;
let seq = 0;
const watchers = new Map<number, { live?: boolean; eventIds?: string[] }>();

/** Tell the server the union of what every mounted component wants to follow. */
function sendWatch() {
  if (!socket?.connected) return;
  const all = [...watchers.values()];
  socket.emit('watch', { live: all.some((w) => w.live), eventIds: [...new Set(all.flatMap((w) => w.eventIds ?? []))] });
}

/** Follow all live updates and/or specific matches while the component is mounted. */
export function useWatch(spec: { live?: boolean; eventIds?: string[] }) {
  const key = JSON.stringify(spec);
  useEffect(() => {
    const id = ++seq;
    watchers.set(id, JSON.parse(key) as typeof spec);
    sendWatch();
    return () => {
      watchers.delete(id);
      sendWatch();
    };
  }, [key]);
}

/** Polling interval: fast without a socket, a slow safety net while pushes arrive. */
export function usePoll(ms: number) {
  const connected = useRealtime((s) => s.connected);
  return connected ? Math.max(ms * 8, 30_000) : ms;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Immutable deep update that keeps the same references where nothing changed (no re-render). */
function patchDeep(value: unknown, fn: (o: Obj) => Obj): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v) => {
      const n = patchDeep(v, fn);
      if (n !== v) changed = true;
      return n;
    });
    return changed ? next : value;
  }
  if (!isObj(value)) return value;
  const obj = fn(value);
  let copy: Obj | null = null;
  for (const [k, v] of Object.entries(obj)) {
    const n = patchDeep(v, fn);
    if (n !== v) (copy ??= { ...obj })[k] = n;
  }
  return copy ?? obj;
}

const EVENT_FIELDS = ['status', 'period', 'minute', 'homeScore', 'awayScore', 'corners', 'cards', 'suspended'] as const;

/** Match state into every cached match (summaries, detail, ticket legs). */
function applyEvent(qc: QueryClient, m: EventStateMessage) {
  qc.setQueriesData({}, (data: unknown) =>
    patchDeep(data, (o) => {
      if (o['id'] !== m.eventId || !('homeTeam' in o)) return o;
      let next: Obj | null = null;
      for (const f of EVENT_FIELDS) if (f in o && o[f] !== m[f]) (next ??= { ...o })[f] = m[f];
      return next ?? o;
    }),
  );
}

/** Prices and market status into every cached market/selection; boosted prices never drop below the boost. */
function applyOdds(qc: QueryClient, m: OddsMessage) {
  const sels = new Map(m.selections.map((s) => [s.selectionId, s]));
  const markets = new Map(m.markets.map((x) => [x.marketId, x.status]));
  qc.setQueriesData({}, (data: unknown) =>
    patchDeep(data, (o) => {
      const id = o['id'] as string;
      if ('selections' in o && markets.has(id) && o['status'] !== markets.get(id)) return { ...o, status: markets.get(id) };
      const s = sels.get(id);
      if (!s || !('oddsMilli' in o) || 'homeTeam' in o) return o;
      const boosted = o['boosted'] === true;
      const oddsMilli = boosted ? Math.max(o['oddsMilli'] as number, s.oddsMilli) : s.oddsMilli;
      if (oddsMilli === o['oddsMilli'] && o['active'] === s.active && (!boosted || o['baseOddsMilli'] === s.oddsMilli)) return o;
      return { ...o, oddsMilli, active: s.active, ...(boosted ? { baseOddsMilli: s.oddsMilli } : {}) };
    }),
  );
}

/** One socket for the whole app: connects, re-authenticates on login/logout, patches caches. */
export function useRealtimeConnection() {
  const qc = useQueryClient();
  useEffect(() => {
    const s = io({
      // through the web app's /api proxy; Next.js strips trailing slashes, so the server uses none either
      path: '/api/socket.io',
      addTrailingSlash: false,
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: useAuth.getState().accessToken }),
      reconnectionDelayMax: 10_000,
    });
    socket = s;
    let connectedBefore = false;

    s.on('connect', () => {
      useRealtime.setState({ connected: true });
      sendWatch();
      // updates may have been missed while disconnected: refresh once
      if (connectedBefore) void qc.invalidateQueries();
      connectedBefore = true;
    });
    s.on('disconnect', () => useRealtime.setState({ connected: false }));

    const slipTouches = (eventId: string, selectionIds: string[] = []) =>
      useSlip.getState().items.some((i) => i.eventId === eventId || selectionIds.includes(i.selectionId));

    s.on('event', (m: EventStateMessage) => {
      applyEvent(qc, m);
      if (slipTouches(m.eventId)) void qc.invalidateQueries({ queryKey: ['slip-odds'] });
    });
    s.on('odds', (m: OddsMessage) => {
      applyOdds(qc, m);
      if (slipTouches(m.eventId, m.selections.map((x) => x.selectionId))) void qc.invalidateQueries({ queryKey: ['slip-odds'] });
    });
    s.on('wallet', (m: WalletMessage) => {
      const { user, setUser } = useAuth.getState();
      if (user && user.id === m.userId && user.balanceBani !== m.balanceBani) setUser({ ...user, balanceBani: m.balanceBani });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
    });
    s.on('ticket', (m: TicketMessage) => {
      void qc.invalidateQueries({ queryKey: ['tickets'] });
      void qc.invalidateQueries({ queryKey: ['ticket-counts'] });
      void qc.invalidateQueries({ queryKey: ['ticket', m.ticketId] });
    });

    // login, logout and token refresh: re-authenticate the socket
    const unsub = useAuth.subscribe((state, prev) => {
      if (state.accessToken !== prev.accessToken) s.emit('auth', state.accessToken);
    });

    return () => {
      unsub();
      s.close();
      socket = null;
      useRealtime.setState({ connected: false });
    };
  }, [qc]);
}
