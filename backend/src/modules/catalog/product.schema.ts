import { z } from 'zod';

export const listProductsQuerySchema = z.object({
  collectionId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
  // Admin-only: also return inactive / soft-deleted products.
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const productIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const productImageParamSchema = z.object({
  id: z.string().uuid(),
  imageId: z.string().uuid(),
});

export const productVariantParamSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
});

// Admin stock route (/api/admin/variants/:variantId/stock).
export const adminVariantParamSchema = z.object({
  variantId: z.string().uuid(),
});

export const updateStockSchema = z.object({
  stockQuantity: z.number().int().nonnegative(),
});

// size / color are nullable in the schema (one-size / no-colour products).
const variantInputSchema = z.object({
  sku: z.string().min(1),
  size: z.string().min(1).nullish(),
  color: z.string().min(1).nullish(),
  stockQuantity: z.number().int().nonnegative().default(0),
});

export const discountTypeSchema = z.enum(['PERCENT', 'AMOUNT']);

export const createProductSchema = z.object({
  sku: z.string().min(1),
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  descriptionEn: z.string().optional(),
  descriptionAr: z.string().optional(),
  categoryId: z.string().uuid(),
  collectionId: z.string().uuid(),
  price: z.number().positive(),
  compareAtPrice: z.number().positive().optional(),
  // Free-standing signed quantity — may be 0 or negative, unrelated to isActive.
  quantity: z.number().int().default(0),
  // Optional sale: both together, or neither. PERCENT is 0–100 (checked in the
  // service so `.partial()` still works for updates).
  saleType: discountTypeSchema.nullish(),
  saleValue: z.number().nonnegative().nullish(),
  variants: z.array(variantInputSchema).min(1),
});

export const updateProductSchema = createProductSchema.partial().omit({ variants: true });

export const createVariantSchema = variantInputSchema;
export const updateVariantSchema = variantInputSchema.partial();
