-- CreateEnum
CREATE TYPE "BackupFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "backupsettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "frequency" "BackupFrequency" NOT NULL DEFAULT 'WEEKLY',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backupsettings_pkey" PRIMARY KEY ("id")
);
