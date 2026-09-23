import { z } from 'zod';
import { promotionStatusSchema } from '../discounts/promotion.schema';

// Same DRAFT/ACTIVE/PAUSED/ENDED status enum Promotion uses — see
// ComboRule's doc comment in schema.prisma for why it's reused rather than
// a parallel ComboRuleStatus.
export { promotionStatusSchema as comboRuleStatusSchema };

const categoryTargetSchema = z.object({
  categoryId: z.string().uuid(),
  includeDescendants: z.boolean(),
});

const comboTierSchema = z
  .object({
    minQty: z.number().int().min(1),
    maxQty: z.number().int().min(1).nullable(),
    // FLAT total price for a group whose size falls in [minQty, maxQty] —
    // not a per-unit price. See ComboTier's doc comment in schema.prisma.
    price: z.number().positive().max(1_000_000),
  })
  .refine((t) => t.maxQty == null || t.maxQty >= t.minQty, {
    message: 'maxQty must be greater than or equal to minQty',
    path: ['maxQty'],
  });

/** Tiers must not have overlapping [minQty, maxQty] ranges — an overlap
 *  would mean two different flat prices claim to apply to the same group
 *  size, which is ambiguous pricing an admin almost certainly didn't intend.
 *  A null maxQty is open-ended, so nothing may start above it once sorted. */
function tiersDontOverlap(tiers: { minQty: number; maxQty: number | null }[]): boolean {
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].maxQty ?? Infinity;
    if (sorted[i].minQty <= prevEnd) return false;
  }
  return true;
}

// Field shapes WITHOUT create-time defaults — see promotion.schema.ts for
// why: defaults live ONLY in createComboRuleSchema, never in the shape
// updateComboRuleSchema derives `.partial()` from, or a PATCH omitting e.g.
// `productIds` would silently wipe it back to `[]`.
const comboRuleShape = {
  nameEn: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
  status: promotionStatusSchema,
  // Single-winner-by-priority across overlapping ComboRules — same rule as
  // Promotion (see lib/combo-pricing.ts pickComboRule).
  priority: z.number().int().min(0).max(1_000_000),
  appliesToAll: z.boolean(),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  productIds: z.array(z.string().uuid()).max(500),
  categoryTargets: z.array(categoryTargetSchema).max(100),
  collectionIds: z.array(z.string().uuid()).max(100),
  tiers: z.array(comboTierSchema).min(1).max(20),
};

export const createComboRuleSchema = z
  .object({
    ...comboRuleShape,
    status: promotionStatusSchema.default('DRAFT'),
    priority: z.number().int().min(0).max(1_000_000).default(0),
    appliesToAll: z.boolean().default(false),
    startsAt: z.string().datetime().nullish(),
    endsAt: z.string().datetime().nullish(),
    productIds: z.array(z.string().uuid()).max(500).default([]),
    categoryTargets: z.array(categoryTargetSchema).max(100).default([]),
    collectionIds: z.array(z.string().uuid()).max(100).default([]),
  })
  .refine((v) => tiersDontOverlap(v.tiers), { message: 'Tiers must not have overlapping quantity ranges', path: ['tiers'] });

export const updateComboRuleSchema = z
  .object(comboRuleShape)
  .partial()
  .refine((v) => v.tiers === undefined || tiersDontOverlap(v.tiers), {
    message: 'Tiers must not have overlapping quantity ranges',
    path: ['tiers'],
  });

export const comboRuleIdParamSchema = z.object({ id: z.string().uuid() });

// Same target fields as create/update, minus everything else — the admin
// form calls this with its current (possibly unsaved) draft to answer
// "which products would this actually cover", mirroring
// previewPromotionCoverageSchema.
export const previewComboCoverageSchema = z.object({
  appliesToAll: z.boolean().default(false),
  productIds: z.array(z.string().uuid()).max(500).default([]),
  categoryTargets: z.array(categoryTargetSchema).max(100).default([]),
  collectionIds: z.array(z.string().uuid()).max(100).default([]),
});

export type CreateComboRuleInput = z.infer<typeof createComboRuleSchema>;
export type UpdateComboRuleInput = z.infer<typeof updateComboRuleSchema>;
export type PreviewComboCoverageInput = z.infer<typeof previewComboCoverageSchema>;
