import { z } from 'zod';
import { hexColor, ctaLabel } from './collection.schema';

export const listCategoriesQuerySchema = z.object({
  // Filter to the direct children of one category.
  parentId: z.string().uuid().optional(),
  // Root-only view: categories with no parent.
  topLevel: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  // Home-featured view: categories with their own row on the home page,
  // across the whole tree in one call — there's no other "all categories"
  // listing endpoint for the home page to piggyback on.
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
// The length / range caps here flow into both create and update.
const categoryShape = {
  nameEn: z.string().trim().min(1).max(200),
  nameAr: z.string().trim().min(1).max(200),
  slug: categorySlug,
  descriptionEn: z.string().trim().max(5000).nullable(),
  descriptionAr: z.string().trim().max(5000).nullable(),
  // Nullable: `null` (on update) makes this a root category. Self-parent and
  // cycle checks happen in category-tree.ts's assertValidParent(), backed by
  // the DB trigger's own checks (see migration 20260912000000).
  parentId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  // Home curation: its own featured row. Any depth.
  showOnHome: z.boolean(),
  // Sibling order among categories with the same parent.
  sortOrder: z.number().int().nonnegative().max(100000),
  // Position of this category's own home row (shared key with
  // Collection.homeSortOrder).
  homeSortOrder: z.number().int().nonnegative().max(100000),
  // Storefront chrome — meaningful in practice only on top-level categories
  // (the old Collection-level Women/Men/Kids nav + home-banner treatment).
  showInNav: z.boolean(),
  showOnHomeAsImage: z.boolean(),
  accentColor: hexColor.nullable(),
  homeImageCtaEn: ctaLabel.or(z.literal('')).nullable(),
  homeImageCtaAr: ctaLabel.or(z.literal('')).nullable(),
};

export const createCategorySchema = z.object({
  ...categoryShape,
  parentId: z.string().uuid().nullish(),
  descriptionEn: z.string().trim().max(5000).nullish(),
  descriptionAr: z.string().trim().max(5000).nullish(),
  isActive: z.boolean().default(true),
  showOnHome: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().max(100000).default(0),
  homeSortOrder: z.number().int().nonnegative().max(100000).default(0),
  showInNav: z.boolean().default(false),
  showOnHomeAsImage: z.boolean().default(false),
  accentColor: hexColor.optional().nullable(),
  homeImageCtaEn: ctaLabel.or(z.literal('')).optional().nullable(),
  homeImageCtaAr: ctaLabel.or(z.literal('')).optional().nullable(),
});

export const updateCategorySchema = z.object(categoryShape).partial();
