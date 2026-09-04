import { z } from 'zod';

export const listCategoriesQuerySchema = z.object({
  collectionId: z.string().uuid().optional(),
  // Standalone-only view: categories not attached to any collection.
  standalone: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  // Home-featured view: categories with their own row on the home page,
  // across every collection (and standalone) in one call — there's no other
  // "all categories" listing endpoint for the home page to piggyback on.
  showOnHome: z
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
  // Home curation: gets its own featured row (name + horizontal scroll of its
  // products) on the home page. Independent of its parent collection's own
  // showOnHome.
  showOnHome: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
});

// All fields optional on update — including collectionId, which is how an
// existing category gets re-linked to a different collection (or, with null,
// detached from its collection entirely).
export const updateCategorySchema = createCategorySchema.partial();
