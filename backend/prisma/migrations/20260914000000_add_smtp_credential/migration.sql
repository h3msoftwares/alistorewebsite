-- CreateTable
CREATE TABLE "smtpcredential" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "user" TEXT,
    "encryptedPassword" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByID" TEXT,

    CONSTRAINT "smtpcredential_pkey" PRIMARY KEY ("id")
);
