-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "entityType" TEXT,
    "entityID" TEXT,
    "requiredPermission" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificationread" (
    "id" UUID NOT NULL,
    "notificationID" UUID NOT NULL,
    "userID" UUID NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificationread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_dateCreated_idx" ON "notification"("dateCreated");

-- CreateIndex
CREATE INDEX "notification_entityType_entityID_idx" ON "notification"("entityType", "entityID");

-- CreateIndex
CREATE INDEX "notificationread_userID_idx" ON "notificationread"("userID");

-- CreateIndex
CREATE UNIQUE INDEX "notificationread_notificationID_userID_key" ON "notificationread"("notificationID", "userID");

-- AddForeignKey
ALTER TABLE "notificationread" ADD CONSTRAINT "notificationread_notificationID_fkey" FOREIGN KEY ("notificationID") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificationread" ADD CONSTRAINT "notificationread_userID_fkey" FOREIGN KEY ("userID") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
