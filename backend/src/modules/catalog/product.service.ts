import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { z } from 'zod';
import { listProductsQuerySchema, createProductSchema, updateProductSchema } from './product.schema';

type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
type CreateProductInput = z.infer<typeof createProductSchema>;
type UpdateProductInput = z.infer<typeof updateProductSchema>;

export async function listProducts(query: ListProductsQuery) {
  const where: Prisma.ProductWhereInput = {
    isActive: true,
    deletedAt: null,
    ...(query.department ? { department: query.department } : {}),
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
    query.sort === 'price_asc' ? { price: 'asc' } : query.sort === 'price_desc' ? { price: 'desc' } : { dateCreated: 'desc' };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { images: { orderBy: { sortOrder: 'asc' } }, variants: true, category: true },
    }),
    prisma.product.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getProductById(id: string) {
  const product = await prisma.product.findFirst({
    where: { id, isActive: true, deletedAt: null },
    include: { images: { orderBy: { sortOrder: 'asc' } }, variants: true, category: true },
  });
  if (!product) throw new AppError('NOT_FOUND', 'Product not found');
  return product;
}

// ---- Admin-side writes ----

export async function createProduct(input: CreateProductInput) {
  return prisma.product.create({
    data: {
      sku: input.sku,
      nameEn: input.nameEn,
      nameAr: input.nameAr,
      descriptionEn: input.descriptionEn,
      descriptionAr: input.descriptionAr,
      categoryID: input.categoryId,
      department: input.department,
      price: input.price,
      compareAtPrice: input.compareAtPrice,
      variants: { create: input.variants },
    },
    include: { variants: true },
  });
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new AppError('NOT_FOUND', 'Product not found');

  return prisma.product.update({
    where: { id },
    data: {
      ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
      ...(input.nameAr !== undefined ? { nameAr: input.nameAr } : {}),
      ...(input.descriptionEn !== undefined ? { descriptionEn: input.descriptionEn } : {}),
      ...(input.descriptionAr !== undefined ? { descriptionAr: input.descriptionAr } : {}),
      ...(input.categoryId !== undefined ? { categoryID: input.categoryId } : {}),
      ...(input.department !== undefined ? { department: input.department } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.compareAtPrice !== undefined ? { compareAtPrice: input.compareAtPrice } : {}),
    },
  });
}

export async function deleteProduct(id: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new AppError('NOT_FOUND', 'Product not found');
  // Soft delete — keeps history for past OrderItems intact.
  await prisma.product.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
}

export async function updateStock(variantId: string, stockQuantity: number) {
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) throw new AppError('NOT_FOUND', 'Variant not found');
  return prisma.productVariant.update({ where: { id: variantId }, data: { stockQuantity } });
}
