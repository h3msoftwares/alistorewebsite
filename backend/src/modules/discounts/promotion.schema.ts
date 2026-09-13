import { z } from 'zod';
import { discountTypeSchema } from './discount-type.schema';

export { discountTypeSchema };

export const promotionStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED']);

// One category target — `includeDescendants` reuses Category.path (Stage 1
// infra): true covers this category and everything under it, false is an
// exact match only.
const categoryTargetSchema = z.object({
  categoryId: z.string().uuid(),
  includeDescendants: z.boolean(),
});

// Field shapes WITHOUT create-time defaults — see category.schema.ts /
// product.schema.ts for why: Zod's `.partial()` does NOT protect a field
// from having its `.default()` re-applied when the key is simply omitted, so
// defaults live ONLY in createPromotionSchema, never in the shape
// updatePromotionSchema derives `.partial()` from — otherwise every PATCH
// that doesn't mention e.g. `productIds` would silently wipe it back to `[]`.
const promotionShape = {
  nameEn: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
  status: promotionStatusSchema,
  type: discountTypeSchema,
  value: z.number().positive().max(1_000_000),
  // Single-winner-by-priority (see lib/pricing.ts pickPromotion) — higher
  // wins outright among every ACTIVE, in-window promotion covering a
  // product. No implicit specificity; the admin sets this directly.
  priority: z.number().int().min(0).max(1_000_000),
  // vs. the product's OWN sale only (renamed from DiscountStacking, same
  // meaning) — true applies on top of it, false replaces it. Promotions
  // never combine with each other regardless of this flag.
  stackable: z.boolean(),
  // Site-wide — mutually exclusive with having any targets at all (checked
  // in the service, see validateShape()).
  appliesToAll: z.boolean(),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  // Zero or more of each — a promotion can target any mix of products,
  // categories, and collections at once. Cross-field "needs at least one
  // target (or appliesToAll)" and percent-range / date-window checks live in
  // the service (so `.partial()` still works for updates — see validateShape()).
  productIds: z.array(z.string().uuid()).max(500),
  categoryTargets: z.array(categoryTargetSchema).max(100),
  collectionIds: z.array(z.string().uuid()).max(100),
};

export const createPromotionSchema = z.object({
  ...promotionShape,
  status: promotionStatusSchema.default('DRAFT'),
  priority: z.number().int().min(0).max(1_000_000).default(0),
  stackable: z.boolean().default(true),
  appliesToAll: z.boolean().default(false),
  startsAt: z.string().datetime().nullish(),
  endsAt: z.string().datetime().nullish(),
  productIds: z.array(z.string().uuid()).max(500).default([]),
  categoryTargets: z.array(categoryTargetSchema).max(100).default([]),
  collectionIds: z.array(z.string().uuid()).max(100).default([]),
});

export const updatePromotionSchema = z.object(promotionShape).partial();

export const promotionIdParamSchema = z.object({ id: z.string().uuid() });

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;
