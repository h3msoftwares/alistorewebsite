-- Confirmed schema changes from Alistore_Schema_Changes_Discussion.md
-- (sections 1, 2 and 5.2). The Collection change from the previous migration
-- is untouched.
--
--  1.1  AuditLog            generic append-only audit table
--  1.2  User.failedLoginAttempts / lockedUntil   account lockout
--  1.3  RefreshToken.familyID / replacedByTokenID  rotation-chain / replay detection
--  1.4  PasswordResetToken  forgotten-password flow
--  1.5  OAuthAccount + User.emailVerified          Google login
--  2.1  ProductVariant.size / color now nullable  (drops the composite unique;
--       duplicate-variant prevention moves to application code)
--  2.2  StockMovement       stock ledger + StockMovementType enum
--  2.3  Cart                one cart row per user/session; CartItem -> cartID
--  2.4  Order delivery snapshot  deliveryName/Phone/Address/City/Area/Notes
--       replace deliveryText + guestName + guestPhone (guestEmail kept)
--  5.2  OrderItem snapshot   productSKU / variantSKU / productImageUrl / lineTotal
--
-- Safe on the current dev DB: cart/cartitem/order/orderitem/refreshtoken are
-- all empty, so the NOT NULL additions have nothing to backfill.

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('INITIAL', 'PURCHASE', 'SALE', 'ADJUSTMENT', 'RETURN', 'RESTOCK');

-- DropForeignKey
ALTER TABLE "cartitem" DROP CONSTRAINT "cartitem_userID_fkey";

-- DropIndex
DROP INDEX "cartitem_sessionID_idx";

-- DropIndex
DROP INDEX "cartitem_sessionID_variantID_key";

-- DropIndex
DROP INDEX "cartitem_userID_idx";

-- DropIndex
DROP INDEX "cartitem_userID_variantID_key";

-- DropIndex
DROP INDEX "productvariant_productID_size_color_key";

-- AlterTable
ALTER TABLE "cartitem" DROP COLUMN "sessionID",
DROP COLUMN "userID",
ADD COLUMN     "cartID" UUID NOT NULL;

-- AlterTable
ALTER TABLE "order" DROP COLUMN "deliveryText",
DROP COLUMN "guestName",
DROP COLUMN "guestPhone",
ADD COLUMN     "deliveryAddress" TEXT NOT NULL,
ADD COLUMN     "deliveryArea" TEXT,
ADD COLUMN     "deliveryCity" TEXT NOT NULL,
ADD COLUMN     "deliveryName" TEXT NOT NULL,
ADD COLUMN     "deliveryNotes" TEXT,
ADD COLUMN     "deliveryPhone" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "orderitem" ADD COLUMN     "lineTotal" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "productImageUrl" TEXT,
ADD COLUMN     "productSKU" TEXT NOT NULL,
ADD COLUMN     "variantSKU" TEXT NOT NULL,
ALTER COLUMN "size" DROP NOT NULL,
ALTER COLUMN "color" DROP NOT NULL;

-- AlterTable
ALTER TABLE "productvariant" ALTER COLUMN "size" DROP NOT NULL,
ALTER COLUMN "color" DROP NOT NULL;

-- AlterTable
ALTER TABLE "refreshtoken" ADD COLUMN     "familyID" UUID NOT NULL,
ADD COLUMN     "replacedByTokenID" UUID;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "emailVerified" TIMESTAMP(3),
ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "passwordresettoken" (
    "id" UUID NOT NULL,
    "userID" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passwordresettoken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthaccount" (
    "id" UUID NOT NULL,
    "userID" UUID NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "providerAccountID" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEdit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauthaccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditlog" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityID" TEXT,
    "action" TEXT NOT NULL,
    "actorID" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditlog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stockmovement" (
    "id" UUID NOT NULL,
    "variantID" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "reason" TEXT,
    "orderID" UUID,
    "actorID" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stockmovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart" (
    "id" UUID NOT NULL,
    "userID" UUID,
    "sessionID" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEdit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "passwordresettoken_tokenHash_key" ON "passwordresettoken"("tokenHash");

-- CreateIndex
CREATE INDEX "passwordresettoken_userID_idx" ON "passwordresettoken"("userID");

-- CreateIndex
CREATE INDEX "oauthaccount_userID_idx" ON "oauthaccount"("userID");

-- CreateIndex
CREATE UNIQUE INDEX "oauthaccount_provider_providerAccountID_key" ON "oauthaccount"("provider", "providerAccountID");

-- CreateIndex
CREATE INDEX "auditlog_entityType_entityID_idx" ON "auditlog"("entityType", "entityID");

-- CreateIndex
CREATE INDEX "auditlog_actorID_idx" ON "auditlog"("actorID");

-- CreateIndex
CREATE INDEX "auditlog_createdAt_idx" ON "auditlog"("createdAt");

-- CreateIndex
CREATE INDEX "stockmovement_variantID_idx" ON "stockmovement"("variantID");

-- CreateIndex
CREATE INDEX "stockmovement_orderID_idx" ON "stockmovement"("orderID");

-- CreateIndex
CREATE UNIQUE INDEX "cart_userID_key" ON "cart"("userID");

-- CreateIndex
CREATE UNIQUE INDEX "cart_sessionID_key" ON "cart"("sessionID");

-- CreateIndex
CREATE INDEX "cartitem_cartID_idx" ON "cartitem"("cartID");

-- CreateIndex
CREATE UNIQUE INDEX "cartitem_cartID_variantID_key" ON "cartitem"("cartID", "variantID");

-- CreateIndex
CREATE INDEX "productvariant_productID_idx" ON "productvariant"("productID");

-- CreateIndex
CREATE UNIQUE INDEX "refreshtoken_replacedByTokenID_key" ON "refreshtoken"("replacedByTokenID");

-- CreateIndex
CREATE INDEX "refreshtoken_familyID_idx" ON "refreshtoken"("familyID");

-- AddForeignKey
ALTER TABLE "refreshtoken" ADD CONSTRAINT "refreshtoken_replacedByTokenID_fkey" FOREIGN KEY ("replacedByTokenID") REFERENCES "refreshtoken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passwordresettoken" ADD CONSTRAINT "passwordresettoken_userID_fkey" FOREIGN KEY ("userID") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthaccount" ADD CONSTRAINT "oauthaccount_userID_fkey" FOREIGN KEY ("userID") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditlog" ADD CONSTRAINT "auditlog_actorID_fkey" FOREIGN KEY ("actorID") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stockmovement" ADD CONSTRAINT "stockmovement_variantID_fkey" FOREIGN KEY ("variantID") REFERENCES "productvariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stockmovement" ADD CONSTRAINT "stockmovement_orderID_fkey" FOREIGN KEY ("orderID") REFERENCES "order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stockmovement" ADD CONSTRAINT "stockmovement_actorID_fkey" FOREIGN KEY ("actorID") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart" ADD CONSTRAINT "cart_userID_fkey" FOREIGN KEY ("userID") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cartitem" ADD CONSTRAINT "cartitem_cartID_fkey" FOREIGN KEY ("cartID") REFERENCES "cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
