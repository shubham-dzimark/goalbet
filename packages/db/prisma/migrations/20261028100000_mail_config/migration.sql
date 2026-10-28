-- CreateTable
CREATE TABLE "MailConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "security" TEXT NOT NULL,
    "username" TEXT,
    "passwordEnc" TEXT,
    "fromName" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailConfig_pkey" PRIMARY KEY ("id")
);


-- one row only
ALTER TABLE "MailConfig" ADD CONSTRAINT "MailConfig_singleton" CHECK ("id" = 'default');
ALTER TABLE "MailConfig" ADD CONSTRAINT "MailConfig_security" CHECK ("security" IN ('tls', 'starttls', 'none'));
ALTER TABLE "MailConfig" ADD CONSTRAINT "MailConfig_port" CHECK ("port" BETWEEN 1 AND 65535);
