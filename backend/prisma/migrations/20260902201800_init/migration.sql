-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('WOMEN', 'MEN', 'KIDS');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('COD', 'CARD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COLLECTED', 'REFUNDED');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refreshtoken" (
    "id" UUID NOT NULL,
    "userID" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refreshtoken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "address" (
    "id" UUID NOT NULL,
    "userID" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "area" TEXT,
    "notes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" UUID NOT NULL,
    "department" "Department" NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentCategoryID" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionAr" TEXT,
    "categoryID" UUID NOT NULL,
    "department" "Department" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "compareAtPrice" DECIMAL(12,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEdit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productimage" (
    "id" UUID NOT NULL,
    "productID" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "altEn" TEXT,
    "altAr" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "productimage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productvariant" (
    "id" UUID NOT NULL,
    "productID" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "productvariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cartitem" (
    "id" UUID NOT NULL,
    "userID" UUID,
    "sessionID" TEXT,
    "variantID" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cartitem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order" (
    "id" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "userID" UUID,
    "addressID" UUID,
    "guestName" TEXT,
    "guestPhone" TEXT,
    "guestEmail" TEXT,
    "deliveryText" TEXT NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'COD',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEdit" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orderitem" (
    "id" UUID NOT NULL,
    "orderID" UUID NOT NULL,
    "variantID" UUID NOT NULL,
    "productName" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "orderitem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_key" ON "user"("phone");

-- CreateIndex
CREATE INDEX "user_role_idx" ON "user"("role");

-- CreateIndex
CREATE UNIQUE INDEX "refreshtoken_tokenHash_key" ON "refreshtoken"("tokenHash");

-- CreateIndex
CREATE INDEX "refreshtoken_userID_idx" ON "refreshtoken"("userID");

-- CreateIndex
CREATE INDEX "address_userID_idx" ON "address"("userID");

-- CreateIndex
CREATE UNIQUE INDEX "category_slug_key" ON "category"("slug");

-- CreateIndex
CREATE INDEX "category_department_idx" ON "category"("department");

-- CreateIndex
CREATE INDEX "category_parentCategoryID_idx" ON "category"("parentCategoryID");

-- CreateIndex
CREATE UNIQUE INDEX "product_sku_key" ON "product"("sku");

-- CreateIndex
CREATE INDEX "product_categoryID_idx" ON "product"("categoryID");

-- CreateIndex
CREATE INDEX "product_department_idx" ON "product"("department");

-- CreateIndex
CREATE INDEX "productimage_productID_idx" ON "productimage"("productID");

-- CreateIndex
CREATE UNIQUE INDEX "productvariant_sku_key" ON "productvariant"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "productvariant_productID_size_color_key" ON "productvariant"("productID", "size", "color");

-- CreateIndex
CREATE INDEX "cartitem_userID_idx" ON "cartitem"("userID");

-- CreateIndex
CREATE INDEX "cartitem_sessionID_idx" ON "cartitem"("sessionID");

-- CreateIndex
CREATE UNIQUE INDEX "cartitem_userID_variantID_key" ON "cartitem"("userID", "variantID");

-- CreateIndex
CREATE UNIQUE INDEX "cartitem_sessionID_variantID_key" ON "cartitem"("sessionID", "variantID");

-- CreateIndex
CREATE UNIQUE INDEX "order_orderNumber_key" ON "order"("orderNumber");

-- CreateIndex
CREATE INDEX "order_userID_idx" ON "order"("userID");

-- CreateIndex
CREATE INDEX "order_status_idx" ON "order"("status");

-- CreateIndex
CREATE INDEX "order_dateCreated_idx" ON "order"("dateCreated");

-- CreateIndex
CREATE INDEX "orderitem_orderID_idx" ON "orderitem"("orderID");

-- AddForeignKey
ALTER TABLE "refreshtoken" ADD CONSTRAINT "refreshtoken_userID_fkey" FOREIGN KEY ("userID") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address" ADD CONSTRAINT "address_userID_fkey" FOREIGN KEY ("userID") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_parentCategoryID_fkey" FOREIGN KEY ("parentCategoryID") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_categoryID_fkey" FOREIGN KEY ("categoryID") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productimage" ADD CONSTRAINT "productimage_productID_fkey" FOREIGN KEY ("productID") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productvariant" ADD CONSTRAINT "productvariant_productID_fkey" FOREIGN KEY ("productID") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cartitem" ADD CONSTRAINT "cartitem_userID_fkey" FOREIGN KEY ("userID") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cartitem" ADD CONSTRAINT "cartitem_variantID_fkey" FOREIGN KEY ("variantID") REFERENCES "productvariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_userID_fkey" FOREIGN KEY ("userID") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_addressID_fkey" FOREIGN KEY ("addressID") REFERENCES "address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orderitem" ADD CONSTRAINT "orderitem_orderID_fkey" FOREIGN KEY ("orderID") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orderitem" ADD CONSTRAINT "orderitem_variantID_fkey" FOREIGN KEY ("variantID") REFERENCES "productvariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
