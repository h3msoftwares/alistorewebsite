import { z } from 'zod';

const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case (lowercase letters, digits, single dashes)');

export const listCollectionsQuerySchema = z.object({
  // Admins can pass includeInactive=true to see hidden collections.
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const collectionIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const createCollectionSchema = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  slug,
  descriptionEn: z.string().optional(),
  descriptionAr: z.string().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().nonnegative().default(0),
  // Optionally attach existing categories to the new collection on creation.
  categoryIds: z.array(z.string().uuid()).optional(),
});

export const updateCollectionSchema = createCollectionSchema.partial().omit({ categoryIds: true });

// Body for POST /:id/categories — link one or more existing categories to this
// collection (moves them; a category belongs to exactly one collection).
export const linkCategoriesSchema = z.object({
  categoryIds: z.array(z.string().uuid()).min(1),
});
