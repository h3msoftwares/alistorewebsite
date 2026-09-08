import { z } from 'zod';

export const discountTypeSchema = z.enum(['PERCENT', 'AMOUNT']);
export const discountScopeSchema = z.enum(['ALL', 'COLLECTION', 'CATEGORY']);
export const discountStackingSchema = z.enum(['STACK', 'OVERRIDE']);

// A PERCENT value is 0–100; an AMOUNT value is a positive currency figure.
// Cross-field + scope↔target checks live in the service (so `.partial()`
// works for updates).
const baseDiscount = z.object({
  nameEn: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
  scope: discountScopeSchema,
  collectionId: z.string().uuid().nullish(),
  categoryId: z.string().uuid().nullish(),
  type: discountTypeSchema,
  value: z.number().positive().max(1_000_000),
  stacking: discountStackingSchema.default('STACK'),
  isActive: z.boolean().default(true),
  // ISO date-time strings; null clears that bound.
  startsAt: z.string().datetime().nullish(),
  endsAt: z.string().datetime().nullish(),
});

export const createDiscountSchema = baseDiscount;
export const updateDiscountSchema = baseDiscount.partial();

export const discountIdParamSchema = z.object({ id: z.string().uuid() });

export type CreateDiscountInput = z.infer<typeof createDiscountSchema>;
export type UpdateDiscountInput = z.infer<typeof updateDiscountSchema>;
