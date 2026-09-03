import { z } from 'zod';

export const listCategoriesQuerySchema = z.object({
  collectionId: z.string().uuid().optional(),
  // Standalone-only view: categories not attached to any collection.
  standalone: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const categoryIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const categorySlugParamSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case'),
});

export const categoryImageParamSchema = z.object({
  id: z.string().uuid(),
  imageId: z.string().uuid(),
});

export const createCategorySchema = z.object({
  // Optional + nullable: a category can stand alone (no collection). Passing
  // null on update detaches an existing category from its collection.
  collectionId: z.string().uuid().nullish(),
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
// existing category gets re-linked to a different collection (or, with null,
// detached from its collection entirely).
export const updateCategorySchema = createCategorySchema.partial();
