import { z } from 'zod';
import { discountTypeSchema } from '../discounts/discount-type.schema';

export const loyaltyMetricSchema = z.enum(['ORDER_COUNT', 'TOTAL_SPENT']);

// threshold: a plain positive count for ORDER_COUNT, a currency amount for
// TOTAL_SPENT — same Decimal-does-double-duty pattern as Coupon.value across
// PERCENT/AMOUNT. Percent-range checks on rewardValue happen in
// loyalty.service.ts (validateShape), same as Coupon — a partial update
// needs to validate against the MERGED effective value, which a schema-level
// refine can't see.
const baseLoyaltyRule = z.object({
  nameEn: z.string().trim().min(1, 'Required').max(80),
  nameAr: z.string().trim().min(1, 'Required').max(80),
  metric: loyaltyMetricSchema,
  threshold: z.number().positive().max(1_000_000),
  isActive: z.boolean().default(true),
  rewardType: discountTypeSchema,
  rewardValue: z.number().positive().max(1_000_000),
  couponValidDays: z.number().int().positive().max(3650).nullish(),
});

export const createLoyaltyRuleSchema = baseLoyaltyRule;
export const updateLoyaltyRuleSchema = baseLoyaltyRule.partial();

export const loyaltyRuleIdParamSchema = z.object({ id: z.string().uuid() });

export type CreateLoyaltyRuleInput = z.infer<typeof createLoyaltyRuleSchema>;
export type UpdateLoyaltyRuleInput = z.infer<typeof updateLoyaltyRuleSchema>;
