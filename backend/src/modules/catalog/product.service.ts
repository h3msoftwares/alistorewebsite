import { Prisma, type DiscountType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { toNumber } from '../../lib/money';
import { effectivePrice, isOnSale } from '../../lib/pricing';
import { z } from 'zod';
import {
  listProductsQuerySchema,
  createProductSchema,
  updateProductSchema,
  createVariantSchema,
  updateVariantSchema,
  createProductImageSchema,
  updateProductImageSchema,
} from './product.schema';

type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
type CreateProductInput = z.infer<typeof createProductSchema>;
type UpdateProductInput = z.infer<typeof updateProductSchema>;
type CreateVariantInput = z.infer<typeof createVariantSchema>;
type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
type CreateProductImageInput = z.infer<typeof createProductImageSchema>;
type UpdateProductImageInput = z.infer<typeof updateProductImageSchema>;

const productInclude = {
  images: { orderBy: { sortOrder: 'asc' as const } },
  variants: true,
  category: true,
  collection: { select: { id: true, nameEn: true, nameAr: true, slug: true } },
};

// Attach the post-sale price so every product/variant read carries what a
// shopper actually pays.
type Priced = {
  price: Prisma.Decimal;
  saleType: DiscountType | null;
  saleValue: Prisma.Decimal | null;
  variants?: { price: Prisma.Decimal | null }[];
};
function withPricing<T extends Priced>(p: T) {
  // A variant with no price of its own falls back to the product's price —
  // the sale (defined at the product level) still applies on top of whichever
  // base price is in play.
  const priceFor = (base: Prisma.Decimal | number) => effectivePrice(base, p.saleType, p.saleValue);
  const onSaleFor = (base: Prisma.Decimal | number) => isOnSale(base, p.saleType, p.saleValue);
  return {
    ...p,
    effectivePrice: priceFor(p.price),
    onSale: onSaleFor(p.price),
    variants: p.variants?.map((v) => {
      const base = v.price ?? p.price;
      return { ...v, effectivePrice: priceFor(base), onSale: onSaleFor(base) };
    }),
  };
}

export async function listProducts(query: ListProductsQuery) {
  const where: Prisma.ProductWhereInput = {
    ...(query.includeInactive ? {} : { isActive: true, deletedAt: null }),
    ...(query.collectionId ? { collectionID: query.collectionId } : {}),
    ...(query.categoryId ? { categoryID: query.categoryId } : {}),
    ...(query.search
      ? {
          OR: [
            { nameEn: { contains: query.search, mode: 'insensitive' } },
            { nameAr: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(query.minPrice || query.maxPrice
      ? {
          price: {
            ...(query.minPrice ? { gte: query.minPrice } : {}),
            ...(query.maxPrice ? { lte: query.maxPrice } : {}),
          },
        }
      : {}),
    ...(query.size || query.color
      ? {
          variants: {
            some: {
              ...(query.size ? { size: query.size } : {}),
              ...(query.color ? { color: query.color } : {}),
            },
          },
        }
      : {}),
  };

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    query.sort === 'price_asc'
      ? { price: 'asc' }
      : query.sort === 'price_desc'
        ? { price: 'desc' }
        : { dateCreated: 'desc' };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: productInclude,
    }),
    prisma.product.count({ where }),
  ]);

  return { items: items.map(withPricing), total, page: query.page, pageSize: query.pageSize };
}

export async function getProductById(id: string, includeInactive = false) {
  const product = await prisma.product.findFirst({
    where: { id, ...(includeInactive ? {} : { isActive: true, deletedAt: null }) },
    include: productInclude,
  });
  if (!product) throw new AppError('NOT_FOUND', 'Product not found');
  return withPricing(product);
}

// ---- Admin-side writes ----

export async function createProduct(input: CreateProductInput) {
  // The product's collection is the denormalized mirror of its category's
  // collection (null when the category stands alone) — never client input.
  const collectionID = await categoryCollectionId(input.categoryId);
  assertNoDuplicateVariants(input.variants);
  assertValidSale(input.saleType, input.saleValue);
  try {
    const created = await prisma.product.create({
      data: {
        sku: input.sku,
        nameEn: input.nameEn,
        nameAr: input.nameAr,
        descriptionEn: input.descriptionEn,
        descriptionAr: input.descriptionAr,
        categoryID: input.categoryId,
        collectionID,
        price: input.price,
        compareAtPrice: input.compareAtPrice,
        quantity: input.quantity,
        saleType: input.saleType ?? null,
        saleValue: input.saleValue ?? null,
        variants: {
          create: input.variants.map((v) => ({
            sku: v.sku,
            size: v.size ?? null,
            color: v.color ?? null,
            price: v.price ?? null,
            stockQuantity: v.stockQuantity,
          })),
        },
      },
      include: productInclude,
    });
    return withPricing(created);
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  const existing = await prisma.product.findUnique({
    where: { id },
    select: { saleType: true, saleValue: true },
  });
  if (!existing) throw new AppError('NOT_FOUND', 'Product not found');

  // Moving the product to another category re-derives its denormalized
  // collection mirror from that category.
  const nextCollectionID =
    input.categoryId !== undefined ? await categoryCollectionId(input.categoryId) : undefined;

  // Validate the sale as it will be after this patch (input value or the
  // one already stored).
  const nextSaleType = input.saleType !== undefined ? (input.saleType ?? null) : existing.saleType;
  const nextSaleValue =
    input.saleValue !== undefined ? (input.saleValue ?? null) : existing.saleValue;
  assertValidSale(nextSaleType, nextSaleValue);

  try {
    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
        ...(input.nameAr !== undefined ? { nameAr: input.nameAr } : {}),
        ...(input.descriptionEn !== undefined ? { descriptionEn: input.descriptionEn } : {}),
        ...(input.descriptionAr !== undefined ? { descriptionAr: input.descriptionAr } : {}),
        ...(input.categoryId !== undefined
          ? { categoryID: input.categoryId, collectionID: nextCollectionID ?? null }
          : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.compareAtPrice !== undefined ? { compareAtPrice: input.compareAtPrice } : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.saleType !== undefined ? { saleType: input.saleType ?? null } : {}),
        ...(input.saleValue !== undefined ? { saleValue: input.saleValue ?? null } : {}),
      },
      include: productInclude,
    });
    return withPricing(updated);
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function deleteProduct(id: string) {
  await ensureProductExists(id);
  // Soft delete — keeps history for past OrderItems intact.
  await prisma.product.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
}

// ---- Variants (sub-resource) ----

export async function addVariant(productId: string, input: CreateVariantInput) {
  await ensureProductExists(productId);
  const existing = await prisma.productVariant.findMany({ where: { productID: productId } });
  assertNoDuplicateVariants([...existing, input]);

  try {
    return await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.create({
        data: {
          productID: productId,
          sku: input.sku,
          size: input.size ?? null,
          color: input.color ?? null,
          price: input.price ?? null,
          stockQuantity: input.stockQuantity,
        },
      });
      if (input.stockQuantity > 0) {
        await tx.stockMovement.create({
          data: {
            variantID: variant.id,
            quantity: input.stockQuantity,
            type: 'INITIAL',
            reason: 'Variant created',
          },
        });
      }
      return variant;
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function updateVariant(
  productId: string,
  variantId: string,
  input: UpdateVariantInput,
  actorId?: string
) {
  const variant = await getVariantOrThrow(productId, variantId);

  const siblings = await prisma.productVariant.findMany({
    where: { productID: productId, id: { not: variantId } },
  });
  assertNoDuplicateVariants([
    ...siblings,
    {
      size: input.size === undefined ? variant.size : input.size,
      color: input.color === undefined ? variant.color : input.color,
    },
  ]);

  const nextStock = input.stockQuantity;
  const delta = nextStock === undefined ? 0 : nextStock - variant.stockQuantity;

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.productVariant.update({
        where: { id: variantId },
        data: {
          ...(input.sku !== undefined ? { sku: input.sku } : {}),
          ...(input.size !== undefined ? { size: input.size } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.price !== undefined ? { price: input.price } : {}),
          ...(nextStock !== undefined ? { stockQuantity: nextStock } : {}),
        },
      });
      if (delta !== 0) {
        await tx.stockMovement.create({
          data: {
            variantID: variantId,
            quantity: delta,
            type: 'ADJUSTMENT',
            actorID: actorId,
            reason: 'Variant edit',
          },
        });
      }
      return updated;
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function deleteVariant(productId: string, variantId: string) {
  await getVariantOrThrow(productId, variantId);
  const inOrder = await prisma.orderItem.count({ where: { variantID: variantId } });
  if (inOrder > 0) {
    throw new AppError('CONFLICT', 'Cannot delete a variant that appears in past orders');
  }
  await prisma.productVariant.delete({ where: { id: variantId } });
}

export async function updateStock(variantId: string, stockQuantity: number, actorId?: string) {
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) throw new AppError('NOT_FOUND', 'Variant not found');

  const delta = stockQuantity - variant.stockQuantity;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.productVariant.update({ where: { id: variantId }, data: { stockQuantity } });
    if (delta !== 0) {
      await tx.stockMovement.create({
        data: {
          variantID: variantId,
          quantity: delta,
          type: 'ADJUSTMENT',
          actorID: actorId,
          reason: 'Manual stock update',
        },
      });
    }
    return updated;
  });
}

// ---- Images (sub-resource) ----

export async function addImage(productId: string, input: CreateProductImageInput) {
  await ensureProductExists(productId);
  return prisma.productImage.create({ data: { productID: productId, ...input } });
}

export async function updateImage(productId: string, imageId: string, input: UpdateProductImageInput) {
  await ensureImageExists(productId, imageId);
  return prisma.productImage.update({ where: { id: imageId }, data: input });
}

export async function deleteImage(productId: string, imageId: string) {
  await ensureImageExists(productId, imageId);
  await prisma.productImage.delete({ where: { id: imageId } });
}

// ---- helpers ----

async function ensureProductExists(id: string) {
  const exists = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError('NOT_FOUND', 'Product not found');
}

async function getVariantOrThrow(productId: string, variantId: string) {
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!variant || variant.productID !== productId) {
    throw new AppError('NOT_FOUND', 'Variant not found');
  }
  return variant;
}

async function ensureImageExists(productId: string, imageId: string) {
  const img = await prisma.productImage.findUnique({
    where: { id: imageId },
    select: { productID: true },
  });
  if (!img || img.productID !== productId) {
    throw new AppError('NOT_FOUND', 'Product image not found');
  }
}

// Resolve a category's collection id (the denormalized value a product mirrors).
// Returns null for a standalone category; throws if the category is unknown.
async function categoryCollectionId(categoryId: string): Promise<string | null> {
  const c = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { collectionID: true },
  });
  if (!c) throw new AppError('NOT_FOUND', 'Category not found');
  return c.collectionID;
}

// saleType + saleValue go together, and a PERCENT sale is bounded 0–100.
function assertValidSale(
  saleType: DiscountType | null | undefined,
  saleValue: number | Prisma.Decimal | null | undefined
) {
  const hasType = saleType != null;
  const hasValue = saleValue != null;
  if (hasType !== hasValue) {
    throw new AppError('VALIDATION_ERROR', 'saleType and saleValue must be set together');
  }
  if (saleType === 'PERCENT') {
    const v = toNumber(saleValue as Prisma.Decimal | number);
    if (v < 0 || v > 100) {
      throw new AppError('VALIDATION_ERROR', 'A percentage sale must be between 0 and 100');
    }
  }
}

// The DB unique on (productID, size, color) was dropped because Postgres treats
// each NULL as distinct — so duplicate prevention lives here instead.
function assertNoDuplicateVariants(
  variants: { size?: string | null; color?: string | null }[]
) {
  const seen = new Set<string>();
  for (const v of variants) {
    const key = `${v.size ?? ''}::${v.color ?? ''}`;
    if (seen.has(key)) {
      throw new AppError('CONFLICT', 'Duplicate variant (same size and colour)');
    }
    seen.add(key);
  }
}

function mapPrismaError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') return new AppError('CONFLICT', 'A record with this SKU already exists');
    if (e.code === 'P2003' || e.code === 'P2025') {
      return new AppError('NOT_FOUND', 'Referenced record not found');
    }
  }
  return e as Error;
}
