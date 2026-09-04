-- CreateTable
CREATE TABLE "favorite" (
    "id" UUID NOT NULL,
    "userID" UUID NOT NULL,
    "productID" UUID NOT NULL,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "favorite_userID_idx" ON "favorite"("userID");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_userID_productID_key" ON "favorite"("userID", "productID");

-- AddForeignKey
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_userID_fkey" FOREIGN KEY ("userID") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_productID_fkey" FOREIGN KEY ("productID") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
