-- CreateEnum
CREATE TYPE "BlacklistType" AS ENUM ('PHONE', 'EMAIL', 'IP');

-- AlterTable
ALTER TABLE "order" ADD COLUMN     "flaggedForReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "flaggedReason" TEXT,
ADD COLUMN     "ipAddress" TEXT;

-- CreateTable
CREATE TABLE "checkoutotp" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeExpiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "verifyTokenHash" TEXT,
    "verifyTokenExpiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "requestIP" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkoutotp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blacklistentry" (
    "id" UUID NOT NULL,
    "type" "BlacklistType" NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blacklistentry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkoutotp_verifyTokenHash_key" ON "checkoutotp"("verifyTokenHash");

-- CreateIndex
CREATE INDEX "checkoutotp_email_createdAt_idx" ON "checkoutotp"("email", "createdAt");

-- CreateIndex
CREATE INDEX "checkoutotp_requestIP_createdAt_idx" ON "checkoutotp"("requestIP", "createdAt");

-- CreateIndex
CREATE INDEX "blacklistentry_type_value_idx" ON "blacklistentry"("type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "blacklistentry_type_value_key" ON "blacklistentry"("type", "value");

-- CreateIndex
CREATE INDEX "order_flaggedForReview_idx" ON "order"("flaggedForReview");

-- AddForeignKey
ALTER TABLE "blacklistentry" ADD CONSTRAINT "blacklistentry_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
