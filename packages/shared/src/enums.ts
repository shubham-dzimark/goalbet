/**
 * Domain enums. String values match the Prisma enums 1:1 so values can flow
 * between DB, API and UI without mapping.
 */

const values = <T extends Record<string, string>>(o: T) => Object.values(o) as T[keyof T][];

export const Sport = { FOOTBALL: 'FOOTBALL' } as const;
export type Sport = (typeof Sport)[keyof typeof Sport];

export const Currency = { RON: 'RON' } as const;
export type Currency = (typeof Currency)[keyof typeof Currency];

export const Locale = { RO: 'ro', EN: 'en' } as const;
export type Locale = (typeof Locale)[keyof typeof Locale];
export const LOCALES = values(Locale);
export const DEFAULT_LOCALE: Locale = 'ro';

export const UserStatus = { ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED' } as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const AdminRole = { SUPER_ADMIN: 'SUPER_ADMIN', OPERATOR: 'OPERATOR', FINANCE: 'FINANCE' } as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];
export const ADMIN_ROLES = values(AdminRole);

export const WalletTxType = {
  ADMIN_CREDIT: 'ADMIN_CREDIT',
  ADMIN_DEBIT: 'ADMIN_DEBIT',
  STAKE: 'STAKE',
  WIN: 'WIN',
  CASHOUT: 'CASHOUT',
  REFUND: 'REFUND',
  VOID_REVERSAL: 'VOID_REVERSAL',
} as const;
export type WalletTxType = (typeof WalletTxType)[keyof typeof WalletTxType];
export const WALLET_TX_TYPES = values(WalletTxType);

export const CreditApprovalStatus = { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' } as const;
export type CreditApprovalStatus = (typeof CreditApprovalStatus)[keyof typeof CreditApprovalStatus];

export const EventStatus = {
  SCHEDULED: 'SCHEDULED',
  LIVE: 'LIVE',
  FINISHED: 'FINISHED',
  CANCELLED: 'CANCELLED',
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

/** Live period shown next to the match minute. */
export const MatchPeriod = {
  NOT_STARTED: 'NOT_STARTED',
  FIRST_HALF: 'FIRST_HALF',
  HALF_TIME: 'HALF_TIME',
  SECOND_HALF: 'SECOND_HALF',
  FULL_TIME: 'FULL_TIME',
} as const;
export type MatchPeriod = (typeof MatchPeriod)[keyof typeof MatchPeriod];

export const MarketStatus = { OPEN: 'OPEN', SUSPENDED: 'SUSPENDED', SETTLED: 'SETTLED' } as const;
export type MarketStatus = (typeof MarketStatus)[keyof typeof MarketStatus];

/** Market period: full time or first half. */
export const MarketPeriod = { FT: 'FT', H1: 'H1' } as const;
export type MarketPeriod = (typeof MarketPeriod)[keyof typeof MarketPeriod];

export const MarketType = {
  MATCH_RESULT: 'MATCH_RESULT',
  DOUBLE_CHANCE: 'DOUBLE_CHANCE',
  TOTAL_GOALS: 'TOTAL_GOALS',
  TEAM_TOTAL_GOALS: 'TEAM_TOTAL_GOALS',
  BTTS: 'BTTS',
  EUROPEAN_HANDICAP: 'EUROPEAN_HANDICAP',
  ASIAN_HANDICAP: 'ASIAN_HANDICAP',
  CORRECT_SCORE: 'CORRECT_SCORE',
  TOTAL_CORNERS: 'TOTAL_CORNERS',
  TOTAL_CARDS: 'TOTAL_CARDS',
  ANYTIME_SCORER: 'ANYTIME_SCORER',
  PLAYER_SHOTS: 'PLAYER_SHOTS',
} as const;
export type MarketType = (typeof MarketType)[keyof typeof MarketType];
export const MARKET_TYPES = values(MarketType);

export const Team = { HOME: 'HOME', AWAY: 'AWAY' } as const;
export type Team = (typeof Team)[keyof typeof Team];

export const SelectionResult = {
  PENDING: 'PENDING',
  WON: 'WON',
  LOST: 'LOST',
  VOID: 'VOID',
  HALF_WON: 'HALF_WON',
  HALF_LOST: 'HALF_LOST',
} as const;
export type SelectionResult = (typeof SelectionResult)[keyof typeof SelectionResult];

export const TicketType = { SINGLE: 'SINGLE', ACCA: 'ACCA' } as const;
export type TicketType = (typeof TicketType)[keyof typeof TicketType];

export const TicketStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  LIVE: 'LIVE',
  WON: 'WON',
  LOST: 'LOST',
  VOID: 'VOID',
  CASHED_OUT: 'CASHED_OUT',
  REJECTED: 'REJECTED',
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];
export const OPEN_TICKET_STATUSES: TicketStatus[] = ['PENDING', 'ACTIVE', 'LIVE'];
export const SETTLED_TICKET_STATUSES: TicketStatus[] = ['WON', 'LOST', 'VOID', 'CASHED_OUT'];

export const LegKind = { SELECTION: 'SELECTION', BET_BUILDER: 'BET_BUILDER' } as const;
export type LegKind = (typeof LegKind)[keyof typeof LegKind];

/** Leg status shares the selection-result vocabulary. */
export type LegStatus = SelectionResult;
export const LegStatus = SelectionResult;

export const OddsChangePreference = { NONE: 'NONE', HIGHER: 'HIGHER', ANY: 'ANY' } as const;
export type OddsChangePreference = (typeof OddsChangePreference)[keyof typeof OddsChangePreference];

export const AuditCategory = { ADMIN: 'ADMIN', WALLET: 'WALLET', BETTING: 'BETTING', SYSTEM: 'SYSTEM' } as const;
export type AuditCategory = (typeof AuditCategory)[keyof typeof AuditCategory];
export const AUDIT_CATEGORIES = values(AuditCategory);

export const ActorType = { USER: 'USER', ADMIN: 'ADMIN', SYSTEM: 'SYSTEM' } as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

/** Self-limit kinds a player can set on their own account (F1.4). */
export const UserLimitType = {
  DAILY_STAKE: 'DAILY_STAKE',
  WEEKLY_STAKE: 'WEEKLY_STAKE',
  MONTHLY_STAKE: 'MONTHLY_STAKE',
  MAX_STAKE_PER_BET: 'MAX_STAKE_PER_BET',
} as const;
export type UserLimitType = (typeof UserLimitType)[keyof typeof UserLimitType];
export const USER_LIMIT_TYPES = values(UserLimitType);
