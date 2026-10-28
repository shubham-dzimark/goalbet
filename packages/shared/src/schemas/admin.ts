import { z } from 'zod';
import { AUDIT_CATEGORIES, MARKET_TYPES, TicketStatus, USER_LIMIT_TYPES, WALLET_TX_TYPES } from '../enums.js';
import { SETTING_KEYS } from '../settings.js';
import { emailSchema, passwordSchema, phoneSchema } from './auth.js';

/** Request schemas for the admin panel (F3.2–F3.8). Shared by the API and the admin app. */

const cursorPage = {
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
};
const dateRange = {
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
};
const reason = z.string().trim().min(3, { message: 'validation.reason' }).max(300);
const bani = z.number().int().positive({ message: 'validation.amount' });

// ── F3.2 users ──
export const adminUserListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  ...cursorPage,
});

export const adminUserUpdateSchema = z
  .object({
    name: z.string().trim().min(2, { message: 'validation.name' }).max(80).optional(),
    phone: phoneSchema.optional(),
    locale: z.enum(['ro', 'en']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'validation.required' });

export const adminUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason,
});

/** Operator-set limit (source ADMIN); null removes it. Applies at once, stacks with the player's own. */
export const adminUserLimitSchema = z.object({
  type: z.enum(USER_LIMIT_TYPES as [string, ...string[]]),
  amountBani: bani.nullable(),
  reason,
});

// ── F3.3 wallet ──
export const adminTransactionQuerySchema = z.object({
  type: z.enum(WALLET_TX_TYPES as [string, ...string[]]).optional(),
  userId: z.uuid().optional(),
  ...dateRange,
  ...cursorPage,
});

// ── F3.4 bets ──
export const adminTicketQuerySchema = z.object({
  /** quick tabs from the flow chart: all · live · open · settled · cash outs */
  view: z.enum(['all', 'open', 'live', 'settled', 'cashout']).default('all'),
  status: z.enum(Object.values(TicketStatus) as [string, ...string[]]).optional(),
  type: z.enum(['SINGLE', 'ACCA']).optional(),
  /** ticket code or player email */
  q: z.string().trim().max(100).optional(),
  userId: z.uuid().optional(),
  ...dateRange,
  ...cursorPage,
});

// ── F3.5 sportsbook ──
export const adminCompetitionUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    isTop: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'validation.required' });

export const adminMarketTypeUpdateSchema = z.object({
  type: z.enum(MARKET_TYPES as [string, ...string[]]),
  enabled: z.boolean(),
});

export const adminEventQuerySchema = z.object({
  competitionId: z.uuid().optional(),
  status: z.enum(['SCHEDULED', 'LIVE', 'FINISHED', 'CANCELLED']).optional(),
  q: z.string().trim().max(100).optional(),
  suspendedOnly: z.coerce.boolean().optional(),
  /** F2.8 finished (or long-overdue) matches that are not settled yet */
  awaitingSettlement: z.coerce.boolean().optional(),
  ...cursorPage,
});

export const adminEventSuspendSchema = z.object({
  suspended: z.boolean(),
  reason,
});

const goals = z.number().int().min(0).max(99);
/**
 * F2.9 manual settlement: the operator enters the final result when the provider has none.
 * Player markets (scorers, shots) are settled for the players the operator lists; others are void.
 */
export const adminSettleEventSchema = z
  .object({
    cancelled: z.boolean().default(false),
    ftHome: goals,
    ftAway: goals,
    htHome: goals,
    htAway: goals,
    corners: z.number().int().min(0).max(99),
    cards: z.number().int().min(0).max(99),
    /** players who appeared, with goals and shots; players left out are void for player markets */
    players: z
      .array(z.object({ ref: z.string().min(1).max(64), goals: z.number().int().min(0).max(20), shots: z.number().int().min(0).max(60) }))
      .max(80)
      .default([]),
    reason,
  })
  .refine((v) => v.cancelled || (v.htHome <= v.ftHome && v.htAway <= v.ftAway), { path: ['htHome'], message: 'validation.halfTime' });
export type AdminSettleEventInput = z.input<typeof adminSettleEventSchema>;

export const adminMarketUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    suspended: z.boolean().optional(),
    reason,
  })
  .refine((v) => v.enabled !== undefined || v.suspended !== undefined, { message: 'validation.required' });

export const adminSettingUpdateSchema = z.object({
  key: z.enum(SETTING_KEYS as [string, ...string[]]),
  value: z.union([z.number().int().min(0), z.boolean()]),
});

// ── F3.6 reports ──
export const adminReportQuerySchema = z.object({ ...dateRange });

// ── F3.8 audit ──
export const adminAuditQuerySchema = z.object({
  category: z.enum(AUDIT_CATEGORIES as [string, ...string[]]).optional(),
  action: z.string().trim().max(60).optional(),
  actorType: z.enum(['USER', 'ADMIN', 'SYSTEM']).optional(),
  /** actor label (e.g. admin email) or entity id */
  q: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(60).optional(),
  ...dateRange,
  ...cursorPage,
});

// ── admin accounts (own account + Super admin management) ──
const totpCode = z.string().trim().regex(/^\d{6}$/, { message: 'validation.totp' });
const adminName = z.string().trim().min(2, { message: 'validation.name' }).max(80);
const adminRole = z.enum(['SUPER_ADMIN', 'OPERATOR', 'FINANCE']);

export const adminAccountUpdateSchema = z.object({ name: adminName });

/** Changing the password needs the current one and a fresh 2FA code; other sessions end. */
export const adminPasswordChangeSchema = z.object({
  currentPassword: z.string().min(1, { message: 'validation.required' }),
  newPassword: passwordSchema,
  totp: totpCode,
});

/** Moving 2FA to a new phone: prove the current authenticator, then confirm the new one. */
export const adminTotpCodeSchema = z.object({ totp: totpCode });
export const adminTotpConfirmSchema = z.object({ setupToken: z.string().min(10), totp: totpCode });

export const adminCreateSchema = z.object({ name: adminName, email: emailSchema, role: adminRole });

export const adminUpdateSchema = z
  .object({ name: adminName.optional(), email: emailSchema.optional(), role: adminRole.optional(), reason })
  .refine((v) => v.name !== undefined || v.email !== undefined || v.role !== undefined, { message: 'validation.required' });

export const adminStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason });
export const adminReasonSchema = z.object({ reason });

// ── data provider (Super admin) ──
export const adminDataProviderUpdateSchema = z.object({
  provider: z.enum(['mock', 'api-football']),
  /** new key; null removes the stored one; omit to keep it */
  apiKey: z.string().trim().min(10, { message: 'validation.required' }).max(200).nullable().optional(),
  leagues: z.array(z.number().int().positive()).min(1, { message: 'validation.required' }).max(30),
  dailyBudget: z.number().int().min(10).max(1_000_000),
  perMinute: z.number().int().min(1).max(1_000),
  reason,
});

export const adminDataProviderTestSchema = z.object({
  /** test this key instead of the stored one (not saved) */
  apiKey: z.string().trim().min(10).max(200).optional(),
});

// ── outgoing email (SMTP) ──
export const MAIL_SECURITY = ['tls', 'starttls', 'none'] as const;
const mailFields = {
  enabled: z.boolean(),
  host: z.string().trim().min(1, { message: 'validation.required' }).max(253),
  port: z.number().int().min(1).max(65535),
  /** tls = implicit TLS (465), starttls = upgrade (587), none = plain (local relays only) */
  security: z.enum(MAIL_SECURITY),
  username: z.string().trim().max(254).default(''),
  fromName: z.string().trim().min(1, { message: 'validation.required' }).max(80),
  fromAddress: emailSchema,
};
/** `password`: string = replace, null = remove, omitted = keep the stored one. */
export const adminMailUpdateSchema = z.object({
  ...mailFields,
  password: z.string().max(500).nullable().optional(),
  reason,
});
export type AdminMailUpdateInput = z.input<typeof adminMailUpdateSchema>;
/** Send a test email with these settings (not saved); no password = use the stored one. */
export const adminMailTestSchema = z.object({
  ...mailFields,
  password: z.string().max(500).optional(),
  to: emailSchema,
});
