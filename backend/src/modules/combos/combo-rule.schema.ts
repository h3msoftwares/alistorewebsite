import { z } from 'zod';
import { promotionStatusSchema } from '../discounts/promotion.schema';
export { promotionStatusSchema as comboRuleStatusSchema };

// maxQty is derived. Reject independently supplied upper bounds.
const comboTierSchema = z.object({
  minQty: z.number().int().min(1).max(2_147_483_647),
  price: z.number().positive().max(1_000_000).multipleOf(0.01),
}).strict();
const tiersSchema = z.array(comboTierSchema).min(1).max(20).refine(
  (tiers) => new Set(tiers.map((tier) => tier.minQty)).size === tiers.length,
  'Each band must have a different minimum quantity',
);
const targeting = {
  appliesToAll: z.literal(false),
  productIds: z.array(z.string().uuid()).length(1, 'Select exactly one product'),
  categoryTargets: z.array(z.object({ categoryId: z.string().uuid(), includeDescendants: z.boolean() })).max(0, 'Category targets are not supported for volume pricing'),
  collectionIds: z.array(z.string().uuid()).max(0, 'Collection targets are not supported for volume pricing'),
};
const shape = {
  nameEn: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
  status: promotionStatusSchema,
  priority: z.number().int().min(0).max(1_000_000),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  ...targeting,
  tiers: tiersSchema,
};
export const createComboRuleSchema = z.object({
  ...shape,
  status: promotionStatusSchema.default('DRAFT'),
  priority: shape.priority.default(0),
  startsAt: shape.startsAt.nullish(),
  endsAt: shape.endsAt.nullish(),
  appliesToAll: targeting.appliesToAll.default(false),
  categoryTargets: targeting.categoryTargets.default([]),
  collectionIds: targeting.collectionIds.default([]),
}).strict();
export const updateComboRuleSchema = z.object(shape).partial().strict();
export const comboRuleIdParamSchema = z.object({ id: z.string().uuid() });
export const previewComboCoverageSchema = z.object({
  ...targeting,
  appliesToAll: targeting.appliesToAll.default(false),
  categoryTargets: targeting.categoryTargets.default([]),
  collectionIds: targeting.collectionIds.default([]),
});
export type CreateComboRuleInput = z.infer<typeof createComboRuleSchema>;
export type UpdateComboRuleInput = z.infer<typeof updateComboRuleSchema>;
export type PreviewComboCoverageInput = z.infer<typeof previewComboCoverageSchema>;
