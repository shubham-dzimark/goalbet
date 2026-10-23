-- AlterTable
ALTER TABLE "AuthSession" ADD COLUMN     "prevTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_prevTokenHash_key" ON "AuthSession"("prevTokenHash");

