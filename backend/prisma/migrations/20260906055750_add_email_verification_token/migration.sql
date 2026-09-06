-- CreateTable
CREATE TABLE "emailverificationtoken" (
    "id" UUID NOT NULL,
    "userID" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emailverificationtoken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emailverificationtoken_tokenHash_key" ON "emailverificationtoken"("tokenHash");

-- CreateIndex
CREATE INDEX "emailverificationtoken_userID_idx" ON "emailverificationtoken"("userID");

-- AddForeignKey
ALTER TABLE "emailverificationtoken" ADD CONSTRAINT "emailverificationtoken_userID_fkey" FOREIGN KEY ("userID") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
