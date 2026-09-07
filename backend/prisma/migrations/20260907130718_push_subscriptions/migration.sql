-- CreateTable
CREATE TABLE "pushsubscription" (
    "id" UUID NOT NULL,
    "userID" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pushsubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pushsubscription_endpoint_key" ON "pushsubscription"("endpoint");

-- CreateIndex
CREATE INDEX "pushsubscription_userID_idx" ON "pushsubscription"("userID");

-- AddForeignKey
ALTER TABLE "pushsubscription" ADD CONSTRAINT "pushsubscription_userID_fkey" FOREIGN KEY ("userID") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
