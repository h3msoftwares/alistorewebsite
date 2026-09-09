-- AlterTable
ALTER TABLE "coupon" ADD COLUMN     "maxPerCustomer" INTEGER,
ADD COLUMN     "maxRedemptions" INTEGER,
ADD COLUMN     "timesRedeemed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "couponredemption" (
    "id" UUID NOT NULL,
    "couponID" UUID NOT NULL,
    "orderID" UUID NOT NULL,
    "userID" UUID,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "couponredemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "couponredemption_orderID_key" ON "couponredemption"("orderID");

-- CreateIndex
CREATE INDEX "couponredemption_couponID_userID_idx" ON "couponredemption"("couponID", "userID");

-- CreateIndex
CREATE INDEX "couponredemption_couponID_email_idx" ON "couponredemption"("couponID", "email");

-- AddForeignKey
ALTER TABLE "couponredemption" ADD CONSTRAINT "couponredemption_couponID_fkey" FOREIGN KEY ("couponID") REFERENCES "coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couponredemption" ADD CONSTRAINT "couponredemption_orderID_fkey" FOREIGN KEY ("orderID") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
