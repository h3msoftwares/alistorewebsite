-- AlterTable
ALTER TABLE "user" ADD COLUMN     "customRoleID" UUID,
ADD COLUMN     "revokedPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEdit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

-- CreateIndex
CREATE INDEX "user_customRoleID_idx" ON "user"("customRoleID");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_customRoleID_fkey" FOREIGN KEY ("customRoleID") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
