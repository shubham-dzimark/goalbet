-- CreateTable
CREATE TABLE "OddsBoost" (
    "id" UUID NOT NULL,
    "selectionId" UUID NOT NULL,
    "odds" DECIMAL(8,3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OddsBoost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OddsBoost_selectionId_key" ON "OddsBoost"("selectionId");

-- CreateIndex
CREATE INDEX "OddsBoost_active_idx" ON "OddsBoost"("active");

-- AddForeignKey
ALTER TABLE "OddsBoost" ADD CONSTRAINT "OddsBoost_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "Selection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

