import { z } from 'zod';
import { USER_LIMIT_TYPES, WALLET_TX_TYPES } from '../enums.js';

const uuid = z.uuid({ message: 'validation.required' });
const bani = z.number().int().positive({ message: 'validation.amount' });
const odds = z.number().int().min(1001).max(10_000_000);

export const betLegSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('SELECTION'), selectionId: uuid, oddsMilli: odds }),
  z.object({
    kind: z.literal('BET_BUILDER'),
    eventId: uuid,
    selectionIds: z.array(uuid).min(2).max(12),
    oddsMilli: odds,
  }),
]);
export type BetLegInput = z.infer<typeof betLegSchema>;

/** POST /bets — one ticket (single or accumulator). Several singles = several requests. */
export const placeBetSchema = z.object({
  type: z.enum(['SINGLE', 'ACCA']),
  stakeBani: bani,
  oddsChangePreference: z.enum(['NONE', 'HIGHER', 'ANY']).default('HIGHER'),
  legs: z.array(betLegSchema).min(1).max(30),
});
export type PlaceBetInput = z.input<typeof placeBetSchema>;

/** F2.5 accept a cash out: the amount the player saw (re-checked against the 1 % tolerance, F2.6). */
export const cashOutAcceptSchema = z.object({ offerBani: z.number().int().positive({ message: 'validation.amount' }) });
export type CashOutAcceptInput = z.input<typeof cashOutAcceptSchema>;

export const ticketListQuerySchema = z.object({
  tab: z.enum(['active', 'settled', 'cashout']).default('active'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const walletQuerySchema = z.object({
  type: z.enum(WALLET_TX_TYPES as [string, ...string[]]).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** F1.4 self-limits; null removes a limit. */
export const setLimitSchema = z.object({
  type: z.enum(USER_LIMIT_TYPES as [string, ...string[]]),
  amountBani: bani.nullable(),
});

export const selfExclusionSchema = z.object({
  /** days, or null for permanent */
  days: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90), z.literal(180), z.literal(365)]).nullable(),
  reason: z.string().max(300).optional(),
});

export const adminWalletAdjustSchema = z.object({
  type: z.enum(['ADMIN_CREDIT', 'ADMIN_DEBIT']),
  amountBani: bani,
  reason: z.string().trim().min(3, { message: 'validation.reason' }).max(300),
});
