-- CreateTable
CREATE TABLE "DataProviderConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "provider" TEXT NOT NULL,
    "apiKeyEnc" TEXT,
    "apiKeyHint" VARCHAR(8),
    "leagues" INTEGER[],
    "dailyBudget" INTEGER NOT NULL DEFAULT 90,
    "perMinute" INTEGER NOT NULL DEFAULT 8,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataProviderConfig_pkey" PRIMARY KEY ("id")
);


-- one row only
ALTER TABLE "DataProviderConfig" ADD CONSTRAINT "DataProviderConfig_singleton" CHECK ("id" = 'default');
ALTER TABLE "DataProviderConfig" ADD CONSTRAINT "DataProviderConfig_provider" CHECK ("provider" IN ('mock', 'api-football'));
