-- CreateTable
CREATE TABLE "emailchangerequest" (
    "id" UUID NOT NULL,
    "userID" UUID NOT NULL,
    "newEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emailchangerequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emailchangerequest_tokenHash_key" ON "emailchangerequest"("tokenHash");

-- CreateIndex
CREATE INDEX "emailchangerequest_userID_idx" ON "emailchangerequest"("userID");

-- AddForeignKey
ALTER TABLE "emailchangerequest" ADD CONSTRAINT "emailchangerequest_userID_fkey" FOREIGN KEY ("userID") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
