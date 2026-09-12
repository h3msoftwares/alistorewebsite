-- CreateTable
CREATE TABLE "drivecredential" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "refreshToken" TEXT,
    "connectedEmail" TEXT,
    "connectedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivecredential_pkey" PRIMARY KEY ("id")
);
