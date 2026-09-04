import { z } from 'zod';

export const addCartItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
});

// Both optional, but at least one must be present. `variantId` repoints the
// line at a different size/color of (in practice) the same product; omitting
// `quantity` alongside it keeps the line's current quantity.
export const updateCartItemSchema = z
  .object({
    quantity: z.number().int().min(1).optional(),
    variantId: z.string().uuid().optional(),
  })
  .refine((data) => data.quantity !== undefined || data.variantId !== undefined, {
    message: 'Provide quantity and/or variantId',
  });

export const cartItemParamSchema = z.object({
  itemId: z.string().uuid(),
});
