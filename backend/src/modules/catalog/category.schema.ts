import { z } from 'zod';

export const listCategoriesQuerySchema = z.object({
  collectionId: z.string().uuid().optional(),
});

export const categoryIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const categoryImageParamSchema = z.object({
  id: z.string().uuid(),
  imageId: z.string().uuid(),
});

export const createCategorySchema = z.object({
  collectionId: z.string().uuid(),
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case'),
  parentCategoryId: z.string().uuid().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().nonnegative().default(0),
});

// All fields optional on update — including collectionId, which is how an
// existing category gets re-linked to a different collection.
export const updateCategorySchema = createCategorySchema.partial();
