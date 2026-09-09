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
  // Matches nameEn / nameAr / slug, case-insensitive.
  search: z.string().trim().min(1).optional(),
  // active = not archived (and isActive); archived = archived only; all = both.
  // Anything other than 'active' is admin-only (see the list controller). The
  // filtered array comes back whole — the admin list page paginates client-side.
  status: z.enum(['active', 'archived', 'all']).optional(),
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

const categorySlug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case');

// Field shapes WITHOUT create-time defaults — see the note in
// collection.schema.ts. `createCategorySchema.partial()` re-applies defaults
// for absent keys, so PATCHing e.g. `homeSortOrder` would reset `showOnHome`.
const categoryShape = {
  // Nullable: a category can stand alone. `null` on update detaches it.
  collectionId: z.string().uuid().nullable(),
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  slug: categorySlug,
  parentCategoryId: z.string().uuid(),
  isActive: z.boolean(),
  // Home curation: its own featured row. Independent of the parent
  // collection's showOnHome.
  showOnHome: z.boolean(),
  // Sibling order within a collection.
  sortOrder: z.number().int().nonnegative(),
  // Position of this category's own home row (shared key with
  // Collection.homeSortOrder).
  homeSortOrder: z.number().int().nonnegative(),
};

export const createCategorySchema = z.object({
  ...categoryShape,
  collectionId: z.string().uuid().nullish(),
  parentCategoryId: z.string().uuid().optional(),
  isActive: z.boolean().default(true),
  showOnHome: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
  homeSortOrder: z.number().int().nonnegative().default(0),
});

export const updateCategorySchema = z.object(categoryShape).partial();
