-- CreateTable
CREATE TABLE "gmailsendcredential" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "refreshToken" TEXT,
    "connectedEmail" TEXT,
    "connectedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gmailsendcredential_pkey" PRIMARY KEY ("id")
);
