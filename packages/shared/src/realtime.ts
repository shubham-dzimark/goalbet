import type { EventStatus, MarketStatus, MatchPeriod, PaymentRequestStatus, PaymentRequestType, TicketStatus } from './enums.js';
import type { CashOutUnavailableReason } from './cashout.js';

/** WebSocket / Redis pub-sub payloads (F1.6, F2.2, F2.3). */

export interface EventStateMessage {
  type: 'event';
  eventId: string;
  status: EventStatus;
  period: MatchPeriod;
  minute: number | null;
  homeScore: number;
  awayScore: number;
  corners: number;
  cards: number;
  suspended: boolean;
}

export interface OddsChange {
  selectionId: string;
  marketId: string;
  oddsMilli: number;
  prevOddsMilli: number;
  active: boolean;
}

export interface OddsMessage {
  type: 'odds';
  eventId: string;
  selections: OddsChange[];
  markets: { marketId: string; status: MarketStatus }[];
}

export type EventMessage = EventStateMessage | OddsMessage;

export interface TicketMessage {
  type: 'ticket';
  userId: string;
  ticketId: string;
  status: TicketStatus;
  cashOut?: { available: true; offerBani: number } | { available: false; reason: CashOutUnavailableReason | 'DISABLED' | 'NOT_OPEN' };
}

export interface WalletMessage {
  type: 'wallet';
  userId: string;
  balanceBani: number;
  /** reserved by pending withdrawals */
  heldBani: number;
}

/** A deposit / withdrawal request changed status (approved, rejected…). */
export interface PaymentMessage {
  type: 'payment';
  userId: string;
  requestId: string;
  requestType: PaymentRequestType;
  status: PaymentRequestStatus;
  amountBani: number;
}

/** Socket.IO rooms */
export const rooms = {
  event: (id: string) => `event:${id}`,
  live: 'live',
  user: (id: string) => `user:${id}`,
} as const;
