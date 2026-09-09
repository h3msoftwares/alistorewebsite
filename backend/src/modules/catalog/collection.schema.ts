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
  // Matches nameEn / nameAr / slug, case-insensitive.
  search: z.string().trim().min(1).optional(),
  // active = not archived (and isActive); archived = archived only; all = both.
  // Anything other than 'active' is admin-only (see the list controller). The
  // set is small (dozens at most) so this returns the whole filtered array —
  // the admin list page paginates client-side. Left un-defaulted so the
  // controller can fall back to the `includeInactive` alias.
  status: z.enum(['active', 'archived', 'all']).optional(),
  // Deprecated alias for status=all — kept so existing admin callers don't break.
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

const ctaLabel = z.string().trim().max(40);

// Field shapes WITHOUT create-time defaults. The update schema partials over
// these, so PATCHing one field never silently writes a `.default()` into the
// others — `createCollectionSchema.partial()` would (Zod re-applies defaults
// for absent keys), which reset showOnHome / sortOrder on every toggle.
const collectionShape = {
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  slug,
  descriptionEn: z.string(),
  descriptionAr: z.string(),
  isActive: z.boolean(),
  // Nav curation: appears in the storefront chrome, ordered by sortOrder.
  // Fully independent of the home-page flags below.
  showInNav: z.boolean(),
  // Home curation: its own featured row (categories scroller). Independent of
  // showInNav — a collection can be in the nav AND on the home page.
  showOnHome: z.boolean(),
  // Home curation: a full-width image banner instead of a row. Takes
  // precedence over showOnHome.
  showOnHomeAsImage: z.boolean(),
  // Nav position (with showInNav).
  sortOrder: z.number().int().nonnegative(),
  // Home-page position — the shared ranking key for every home block.
  homeSortOrder: z.number().int().nonnegative(),
  accentColor: hexColor.nullable(),
  homeImageCtaEn: ctaLabel.or(z.literal('')).nullable(),
  homeImageCtaAr: ctaLabel.or(z.literal('')).nullable(),
};

export const createCollectionSchema = z.object({
  ...collectionShape,
  descriptionEn: z.string().optional(),
  descriptionAr: z.string().optional(),
  isActive: z.boolean().default(true),
  showInNav: z.boolean().default(false),
  showOnHome: z.boolean().default(false),
  showOnHomeAsImage: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
  homeSortOrder: z.number().int().nonnegative().default(0),
  accentColor: hexColor.optional().nullable(),
  homeImageCtaEn: ctaLabel.or(z.literal('')).optional().nullable(),
  homeImageCtaAr: ctaLabel.or(z.literal('')).optional().nullable(),
  // Optionally attach existing categories to the new collection on creation.
  categoryIds: z.array(z.string().uuid()).optional(),
});

export const updateCollectionSchema = z.object(collectionShape).partial();

// Body for POST /:id/categories — link one or more existing categories to this
// collection (moves them; a category belongs to exactly one collection).
export const linkCategoriesSchema = z.object({
  categoryIds: z.array(z.string().uuid()).min(1),
});
