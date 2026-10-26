import type {
  ActorType,
  AdminRole,
  AuditCategory,
  CreditApprovalStatus,
  EventStatus,
  MarketType,
  TicketStatus,
  UserLimitType,
  UserStatus,
  WalletTxType,
} from './enums.js';
import type { Settings } from './settings.js';
import type { TicketDto } from './catalog.js';

/** Response shapes of the admin API (F3.2–F3.8). */

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: UserStatus;
  balanceBani: number;
  openTickets: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminUserLimit {
  type: UserLimitType;
  source: 'USER' | 'ADMIN';
  amountBani: number;
  pendingAmountBani: number | null;
  effectiveAt: string;
}

export interface AdminUserDetail extends AdminUserRow {
  dateOfBirth: string;
  locale: string;
  oddsChangePreference: string;
  limits: AdminUserLimit[];
  selfExclusion: { startsAt: string; endsAt: string | null; reason: string | null } | null;
  stats: {
    tickets: number;
    openStakeBani: number;
    totalStakedBani: number;
    totalReturnedBani: number;
    won: number;
    lost: number;
  };
  recentRejections: { code: string; createdAt: string }[];
}

export interface AdminTransactionRow {
  id: string;
  type: WalletTxType;
  amountBani: number;
  balanceAfterBani: number;
  reason: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
  ticketCode: string | null;
  admin: { id: string; email: string } | null;
}

export interface AdminApprovalRow {
  id: string;
  type: WalletTxType;
  amountBani: number;
  reason: string;
  status: CreditApprovalStatus;
  createdAt: string;
  user: { id: string; name: string; email: string };
  requestedBy: { id: string; email: string };
}

export interface AdminTicketRow extends TicketDto {
  user: { id: string; name: string; email: string };
}

export interface AdminCompetitionRow {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  enabled: boolean;
  isTop: boolean;
  active: boolean;
  sortOrder: number;
  upcoming: number;
  live: number;
}

export interface AdminMarketTypeRow {
  type: MarketType;
  enabled: boolean;
  openMarkets: number;
}

export interface AdminEventRow {
  id: string;
  competition: { id: string; name: string; countryCode: string };
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  status: EventStatus;
  minute: number | null;
  homeScore: number;
  awayScore: number;
  suspended: boolean;
  feedSuspended: boolean;
  markets: number;
  openTickets: number;
}

export interface AdminMarketRow {
  id: string;
  type: MarketType;
  period: string;
  /** hundredths, as in the catalogue (250 = 2.5) */
  lineCenti: number | null;
  playerName: string | null;
  status: string;
  enabled: boolean;
  adminSuspended: boolean;
  selections: { id: string; outcome: string; label: string | null; oddsMilli: number; active: boolean }[];
}

export interface AdminReport {
  range: { from: string; to: string };
  users: { total: number; new: number; active: number; suspended: number };
  betting: { tickets: number; stakesBani: number; payoutsBani: number; ggrBani: number; avgStakeBani: number };
  wallet: { creditsBani: number; debitsBani: number; depositsBani: number; withdrawalsBani: number };
  byStatus: Partial<Record<TicketStatus, number>>;
  exposure: { openTickets: number; openStakeBani: number; potentialPayoutBani: number };
  daily: { date: string; stakesBani: number; payoutsBani: number; tickets: number }[];
  topExposure: { eventId: string; name: string; startTime: string; status: EventStatus; tickets: number; potentialPayoutBani: number }[];
}

export interface AdminDashboard {
  liveEvents: number;
  openTickets: number;
  pendingApprovals: number;
  /** player deposit / withdrawal requests waiting for Finance */
  pendingPayments: number;
  today: { tickets: number; stakesBani: number; payoutsBani: number; newUsers: number };
  exposureBani: number;
  last7Days: { date: string; stakesBani: number; payoutsBani: number }[];
  recentAudit: AdminAuditRow[];
}

export interface AdminAuditRow {
  id: string;
  category: AuditCategory;
  action: string;
  actorType: ActorType;
  actorId: string | null;
  actorLabel: string | null;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  meta: unknown;
  ip: string | null;
  createdAt: string;
}

export interface AdminSettings {
  values: Settings;
  updatedAt: Partial<Record<keyof Settings, string>>;
}

export type AdminRoleName = AdminRole;

export interface AdminSessionRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export interface AdminAccount {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  locale: string;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  sessions: AdminSessionRow[];
}

export interface AdminUserAccountRow {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: UserStatus;
  totpEnabled: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Shown once, never stored in clear text. */
export interface AdminTempPassword {
  admin: AdminUserAccountRow;
  temporaryPassword: string;
}

export interface AdminTotpSetup {
  setupToken: string;
  otpauthUrl: string;
  qrDataUrl: string;
  secret: string;
}

export interface AdminDataProviderStatus {
  provider: 'mock' | 'api-football';
  /** "admin" once saved in the panel; "env" while the server's env vars are used */
  source: 'admin' | 'env';
  apiKey: { set: boolean; hint: string | null };
  leagues: { id: number; name: string; country: string; countryCode: string; selected: boolean }[];
  dailyBudget: number;
  perMinute: number;
  updatedAt: string | null;
  /** API-Football calls today (our own budget counter) and what the provider reports left */
  usage: { today: number; budget: number; providerRemaining: number | null } | null;
  feed: { lastLiveDataAt: string | null; ageSeconds: number | null; stallSeconds: number };
}

export interface AdminDataProviderTest {
  ok: boolean;
  plan?: string;
  active?: boolean;
  subscriptionEnd?: string | null;
  requestsToday?: number;
  limitDay?: number;
  error?: string;
}
