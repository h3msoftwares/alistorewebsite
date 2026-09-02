import { z } from 'zod';

export const listProductsQuerySchema = z.object({
  department: z.enum(['WOMEN', 'MEN', 'KIDS']).optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

export const productIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const createProductSchema = z.object({
  sku: z.string().min(1),
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  descriptionEn: z.string().optional(),
  descriptionAr: z.string().optional(),
  categoryId: z.string().uuid(),
  department: z.enum(['WOMEN', 'MEN', 'KIDS']),
  price: z.number().positive(),
  compareAtPrice: z.number().positive().optional(),
  variants: z
    .array(
      z.object({
        sku: z.string().min(1),
        size: z.string().min(1),
        color: z.string().min(1),
        stockQuantity: z.number().int().nonnegative().default(0),
      })
    )
    .min(1),
});

export const updateProductSchema = createProductSchema.partial().omit({ variants: true });
