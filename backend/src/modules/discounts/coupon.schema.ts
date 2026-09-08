import { z } from 'zod';
import { discountTypeSchema } from './discount.schema';

// Code: letters/digits/-/_ , stored upper-cased. Value bounds (PERCENT 0–100)
// checked in the service.
const baseCoupon = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, 'Letters, digits, - and _ only'),
  type: discountTypeSchema,
  value: z.number().positive().max(1_000_000),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().nullish(),
  endsAt: z.string().datetime().nullish(),
  // Usage caps — null/omitted = unlimited (the pre-existing behaviour).
  maxRedemptions: z.number().int().positive().max(1_000_000).nullish(),
  maxPerCustomer: z.number().int().positive().max(1000).nullish(),
});

export const createCouponSchema = baseCoupon;
export const updateCouponSchema = baseCoupon.partial();

export const couponIdParamSchema = z.object({ id: z.string().uuid() });

export const validateCouponSchema = z.object({
  code: z.string().trim().min(1).max(40),
});

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
