import { z } from 'zod';

// Slugs that map to a static storefront route (app/[locale]/<slug>) or the
// catch-all — a collection using one would be shadowed and unreachable.
const RESERVED_SLUGS = new Set([
  'cart',
  'checkout',
  'login',
  'register',
  'account',
  'orders',
  'favourites',
  'admin',
  'dev',
  'product',
  'category',
]);

const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case (lowercase letters, digits, single dashes)')
  .refine((s) => !RESERVED_SLUGS.has(s), 'this slug is reserved by the storefront');

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'accentColor must be a #rrggbb hex colour');

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

export const collectionSlugParamSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case'),
});

export const collectionImageParamSchema = z.object({
  id: z.string().uuid(),
  imageId: z.string().uuid(),
});

export const createCollectionSchema = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  slug,
  descriptionEn: z.string().optional(),
  descriptionAr: z.string().optional(),
  isActive: z.boolean().default(true),
  // Nav curation: appears in the storefront chrome, ordered by sortOrder.
  showInNav: z.boolean().default(false),
  // Home curation: gets its own featured row (name + horizontal scroll of its
  // categories) on the home page. Independent of showInNav.
  showOnHome: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
  accentColor: hexColor.optional().nullable(),
  // Optionally attach existing categories to the new collection on creation.
  categoryIds: z.array(z.string().uuid()).optional(),
});

export const updateCollectionSchema = createCollectionSchema.partial().omit({ categoryIds: true });

// Body for POST /:id/categories — link one or more existing categories to this
// collection (moves them; a category belongs to exactly one collection).
export const linkCategoriesSchema = z.object({
  categoryIds: z.array(z.string().uuid()).min(1),
});
