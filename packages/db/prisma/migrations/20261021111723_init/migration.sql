-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'OPERATOR', 'FINANCE');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "OddsChangePreference" AS ENUM ('NONE', 'HIGHER', 'ANY');

-- CreateEnum
CREATE TYPE "UserLimitType" AS ENUM ('DAILY_STAKE', 'WEEKLY_STAKE', 'MONTHLY_STAKE', 'MAX_STAKE_PER_BET');

-- CreateEnum
CREATE TYPE "LimitSource" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('ADMIN_CREDIT', 'ADMIN_DEBIT', 'STAKE', 'WIN', 'CASHOUT', 'REFUND', 'VOID_REVERSAL');

-- CreateEnum
CREATE TYPE "CreditApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MatchPeriod" AS ENUM ('NOT_STARTED', 'FIRST_HALF', 'HALF_TIME', 'SECOND_HALF', 'FULL_TIME');

-- CreateEnum
CREATE TYPE "MarketType" AS ENUM ('MATCH_RESULT', 'DOUBLE_CHANCE', 'TOTAL_GOALS', 'TEAM_TOTAL_GOALS', 'BTTS', 'EUROPEAN_HANDICAP', 'ASIAN_HANDICAP', 'CORRECT_SCORE', 'TOTAL_CORNERS', 'TOTAL_CARDS', 'ANYTIME_SCORER', 'PLAYER_SHOTS');

-- CreateEnum
CREATE TYPE "MarketPeriod" AS ENUM ('FT', 'H1');

-- CreateEnum
CREATE TYPE "Team" AS ENUM ('HOME', 'AWAY');

-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('OPEN', 'SUSPENDED', 'SETTLED');

-- CreateEnum
CREATE TYPE "SelectionResult" AS ENUM ('PENDING', 'WON', 'LOST', 'VOID', 'HALF_WON', 'HALF_LOST');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('SINGLE', 'ACCA');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('PENDING', 'ACTIVE', 'LIVE', 'WON', 'LOST', 'VOID', 'CASHED_OUT', 'REJECTED');

-- CreateEnum
CREATE TYPE "LegKind" AS ENUM ('SELECTION', 'BET_BUILDER');

-- CreateEnum
CREATE TYPE "AuditCategory" AS ENUM ('ADMIN', 'WALLET', 'BETTING', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "locale" TEXT NOT NULL DEFAULT 'ro',
    "oddsChangePreference" "OddsChangePreference" NOT NULL DEFAULT 'HIGHER',
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLimit" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "UserLimitType" NOT NULL,
    "source" "LimitSource" NOT NULL DEFAULT 'USER',
    "amountBani" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pendingAmountBani" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelfExclusion" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SelfExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "subjectType" "ActorType" NOT NULL,
    "subjectId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "locale" TEXT NOT NULL DEFAULT 'ro',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "balanceBani" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'RON',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "amountBani" INTEGER NOT NULL,
    "balanceAfterBani" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ticketId" UUID,
    "adminId" UUID,
    "approvalId" UUID,
    "uniqueRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditApproval" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "amountBani" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CreditApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" UUID NOT NULL,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" UUID NOT NULL,
    "providerRef" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isTop" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "providerRef" TEXT NOT NULL,
    "competitionId" UUID NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "period" "MatchPeriod" NOT NULL DEFAULT 'NOT_STARTED',
    "minute" INTEGER,
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "htHomeScore" INTEGER,
    "htAwayScore" INTEGER,
    "corners" INTEGER NOT NULL DEFAULT 0,
    "cards" INTEGER NOT NULL DEFAULT 0,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "feedSuspended" BOOLEAN NOT NULL DEFAULT false,
    "isTop" BOOLEAN NOT NULL DEFAULT false,
    "players" JSONB NOT NULL DEFAULT '[]',
    "result" JSONB,
    "lastFeedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "type" "MarketType" NOT NULL,
    "period" "MarketPeriod" NOT NULL DEFAULT 'FT',
    "line" DECIMAL(5,2),
    "team" "Team",
    "playerRef" TEXT,
    "playerName" TEXT,
    "status" "MarketStatus" NOT NULL DEFAULT 'OPEN',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketTypeSetting" (
    "type" "MarketType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketTypeSetting_pkey" PRIMARY KEY ("type")
);

-- CreateTable
CREATE TABLE "Selection" (
    "id" UUID NOT NULL,
    "marketId" UUID NOT NULL,
    "outcome" TEXT NOT NULL,
    "label" TEXT,
    "team" "Team",
    "odds" DECIMAL(8,3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "result" "SelectionResult" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Selection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OddsHistory" (
    "id" BIGSERIAL NOT NULL,
    "selectionId" UUID NOT NULL,
    "odds" DECIMAL(8,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OddsHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" UUID NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "userId" UUID NOT NULL,
    "type" "TicketType" NOT NULL,
    "status" "TicketStatus" NOT NULL,
    "stakeBani" INTEGER NOT NULL,
    "totalOdds" DECIMAL(14,3) NOT NULL,
    "potentialWinBani" INTEGER NOT NULL,
    "payoutBani" INTEGER,
    "cashedOutBani" INTEGER,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "oddsChangePreference" "OddsChangePreference" NOT NULL DEFAULT 'NONE',
    "idempotencyKey" TEXT,
    "acceptAfter" TIMESTAMP(3),
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "cashedOutAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketLeg" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "kind" "LegKind" NOT NULL,
    "oddsAtPlacement" DECIMAL(8,3) NOT NULL,
    "status" "SelectionResult" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "TicketLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketLegSelection" (
    "id" UUID NOT NULL,
    "legId" UUID NOT NULL,
    "selectionId" UUID NOT NULL,
    "oddsAtPlacement" DECIMAL(8,3) NOT NULL,
    "result" "SelectionResult" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "TicketLegSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BetAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "code" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "details" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementRecord" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "adminId" UUID,
    "reason" TEXT,
    "ticketsSettled" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "subjectId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" INTEGER,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "category" "AuditCategory" NOT NULL,
    "action" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" UUID,
    "actorLabel" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "meta" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserLimit_userId_type_source_key" ON "UserLimit"("userId", "type", "source");

-- CreateIndex
CREATE INDEX "SelfExclusion_userId_endsAt_idx" ON "SelfExclusion"("userId", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_subjectType_subjectId_idx" ON "AuthSession"("subjectType", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_approvalId_key" ON "WalletTransaction"("approvalId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_uniqueRef_key" ON "WalletTransaction"("uniqueRef");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_type_createdAt_idx" ON "WalletTransaction"("type", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_ticketId_idx" ON "WalletTransaction"("ticketId");

-- CreateIndex
CREATE INDEX "CreditApproval_status_createdAt_idx" ON "CreditApproval"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_providerRef_key" ON "Competition"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "Event_providerRef_key" ON "Event"("providerRef");

-- CreateIndex
CREATE INDEX "Event_startTime_idx" ON "Event"("startTime");

-- CreateIndex
CREATE INDEX "Event_status_startTime_idx" ON "Event"("status", "startTime");

-- CreateIndex
CREATE INDEX "Event_competitionId_startTime_idx" ON "Event"("competitionId", "startTime");

-- CreateIndex
CREATE INDEX "Market_eventId_type_idx" ON "Market"("eventId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Market_eventId_key_key" ON "Market"("eventId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Selection_marketId_outcome_key" ON "Selection"("marketId", "outcome");

-- CreateIndex
CREATE INDEX "OddsHistory_selectionId_createdAt_idx" ON "OddsHistory"("selectionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_code_key" ON "Ticket"("code");

-- CreateIndex
CREATE INDEX "Ticket_userId_createdAt_idx" ON "Ticket"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_status_createdAt_idx" ON "Ticket"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_userId_idempotencyKey_key" ON "Ticket"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TicketLeg_ticketId_idx" ON "TicketLeg"("ticketId");

-- CreateIndex
CREATE INDEX "TicketLeg_eventId_status_idx" ON "TicketLeg"("eventId", "status");

-- CreateIndex
CREATE INDEX "TicketLegSelection_legId_idx" ON "TicketLegSelection"("legId");

-- CreateIndex
CREATE INDEX "TicketLegSelection_selectionId_idx" ON "TicketLegSelection"("selectionId");

-- CreateIndex
CREATE INDEX "BetAttempt_userId_createdAt_idx" ON "BetAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BetAttempt_code_createdAt_idx" ON "BetAttempt"("code", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementRecord_eventId_version_key" ON "SettlementRecord"("eventId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_scope_subjectId_key_key" ON "IdempotencyRecord"("scope", "subjectId", "key");

-- CreateIndex
CREATE INDEX "AuditLog_category_createdAt_idx" ON "AuditLog"("category", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "UserLimit" ADD CONSTRAINT "UserLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelfExclusion" ADD CONSTRAINT "SelfExclusion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "CreditApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditApproval" ADD CONSTRAINT "CreditApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditApproval" ADD CONSTRAINT "CreditApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditApproval" ADD CONSTRAINT "CreditApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Selection" ADD CONSTRAINT "Selection_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OddsHistory" ADD CONSTRAINT "OddsHistory_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "Selection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketLeg" ADD CONSTRAINT "TicketLeg_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketLeg" ADD CONSTRAINT "TicketLeg_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketLegSelection" ADD CONSTRAINT "TicketLegSelection_legId_fkey" FOREIGN KEY ("legId") REFERENCES "TicketLeg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketLegSelection" ADD CONSTRAINT "TicketLegSelection_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "Selection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetAttempt" ADD CONSTRAINT "BetAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRecord" ADD CONSTRAINT "SettlementRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
