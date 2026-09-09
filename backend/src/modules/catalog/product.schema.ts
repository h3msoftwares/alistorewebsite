import { z } from 'zod';
import { createImageSchema } from './image.schema';

// Upper bounds for the free-text catalog fields. Nothing legitimate comes
// near these; without them a direct API caller can store ~100 KB (the
// express.json body cap) per field. Names/SKUs are short; descriptions get
// room for a paragraph or two.
const NAME_MAX = 200;
const SKU_MAX = 64;
const DESC_MAX = 5000;
const VARIANT_ATTR_MAX = 60;
const PRICE_MAX = 1_000_000;

export const listProductsQuerySchema = z.object({
  collectionId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  size: z.string().max(VARIANT_ATTR_MAX).optional(),
  color: z.string().max(VARIANT_ATTR_MAX).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  // Only products that are on sale / discounted right now (own sale or an
  // active catalog discount covering their category/collection).
  onSale: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  // `best_selling` ranks by units sold in the last 90 days (see product.service);
  // with no recent sales it falls back to `newest`.
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'best_selling']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
  // active = live products; archived = soft-deleted only; all = both.
  // Anything other than 'active' is admin-only (see listProductsHandler).
  status: z.enum(['active', 'archived', 'all']).optional(),
  // Deprecated alias for status=all — kept so existing admin callers don't break.
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
// price is nullish too — omit it (or send null) to fall back to the
// product's own price; set it to give this size/colour its own price.
const variantInputSchema = z.object({
  sku: z.string().trim().min(1).max(SKU_MAX),
  size: z.string().trim().min(1).max(VARIANT_ATTR_MAX).nullish(),
  color: z.string().trim().min(1).max(VARIANT_ATTR_MAX).nullish(),
  price: z.number().positive().max(PRICE_MAX).nullish(),
  stockQuantity: z.number().int().nonnegative().max(1_000_000).default(0),
});

export const discountTypeSchema = z.enum(['PERCENT', 'AMOUNT']);

export const createProductSchema = z.object({
  sku: z.string().trim().min(1).max(SKU_MAX),
  nameEn: z.string().trim().min(1).max(NAME_MAX),
  nameAr: z.string().trim().min(1).max(NAME_MAX),
  descriptionEn: z.string().trim().max(DESC_MAX).optional(),
  descriptionAr: z.string().trim().max(DESC_MAX).optional(),
  categoryId: z.string().uuid(),
  // No collectionId: a product's collection is the denormalized mirror of its
  // category's collection, derived server-side. It is never set directly.
  price: z.number().positive().max(PRICE_MAX),
  compareAtPrice: z.number().positive().max(PRICE_MAX).optional(),
  // Free-standing signed quantity — may be 0 or negative, unrelated to isActive.
  quantity: z.number().int().min(-1_000_000).max(1_000_000).default(0),
  // Optional sale: both together, or neither. PERCENT is 0–100 (checked in the
  // service so `.partial()` still works for updates).
  saleType: discountTypeSchema.nullish(),
  saleValue: z.number().nonnegative().max(PRICE_MAX).nullish(),
  variants: z.array(variantInputSchema).min(1).max(100),
});

export const updateProductSchema = createProductSchema.partial().omit({ variants: true });

export const createVariantSchema = variantInputSchema;
export const updateVariantSchema = variantInputSchema.partial();

// Product images extend the shared Collection/Category/Product image shape
// with an optional colour tag — ties the image to one of the product's
// colour options so the product page can swap to it when that colour is
// selected. null/omitted = shown regardless of colour.
export const createProductImageSchema = createImageSchema.extend({
  color: z.string().min(1).nullish(),
});
export const updateProductImageSchema = createProductImageSchema.partial();
