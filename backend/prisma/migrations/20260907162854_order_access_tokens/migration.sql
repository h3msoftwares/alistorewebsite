-- CreateTable
CREATE TABLE "orderaccesstoken" (
    "id" UUID NOT NULL,
    "orderID" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orderaccesstoken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orderaccesstoken_tokenHash_key" ON "orderaccesstoken"("tokenHash");

-- CreateIndex
CREATE INDEX "orderaccesstoken_orderID_idx" ON "orderaccesstoken"("orderID");

-- AddForeignKey
ALTER TABLE "orderaccesstoken" ADD CONSTRAINT "orderaccesstoken_orderID_fkey" FOREIGN KEY ("orderID") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
