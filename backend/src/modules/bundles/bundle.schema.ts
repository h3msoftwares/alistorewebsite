import { z } from 'zod';
import { promotionStatusSchema } from '../discounts/promotion.schema';

const components = z.array(z.object({
  variantID: z.string().uuid(), quantity: z.number().int().min(1).max(999),
}).strict()).min(2).max(20).refine(
  (items) => new Set(items.map((c) => c.variantID)).size === items.length, 'Select each SKU once',
);
const shape = {
  nameEn: z.string().trim().min(1).max(120), nameAr: z.string().trim().min(1).max(120),
  price: z.number().positive().max(1_000_000).multipleOf(0.01),
  status: promotionStatusSchema,
  startsAt: z.string().datetime().nullable(), endsAt: z.string().datetime().nullable(), components,
};
export const createBundleSchema = z.object({ ...shape, status: shape.status.default('DRAFT'), startsAt: shape.startsAt.nullish(), endsAt: shape.endsAt.nullish() }).strict();
export const updateBundleSchema = z.object(shape).partial().strict();
export const bundleIdSchema = z.object({ id: z.string().uuid() });
export type CreateBundleInput = z.infer<typeof createBundleSchema>;
export type UpdateBundleInput = z.infer<typeof updateBundleSchema>;
