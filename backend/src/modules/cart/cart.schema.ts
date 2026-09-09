import { z } from 'zod';

// A single cart line never legitimately holds hundreds of units; the cap
// rejects an absurd value at validation rather than leaning on the stock
// check further downstream.
const cartQuantity = z.number().int().min(1).max(999);

export const addCartItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: cartQuantity.default(1),
});

// Both optional, but at least one must be present. `variantId` repoints the
// line at a different size/color of (in practice) the same product; omitting
// `quantity` alongside it keeps the line's current quantity.
export const updateCartItemSchema = z
  .object({
    quantity: cartQuantity.optional(),
    variantId: z.string().uuid().optional(),
  })
  .refine((data) => data.quantity !== undefined || data.variantId !== undefined, {
    message: 'Provide quantity and/or variantId',
  });

export const cartItemParamSchema = z.object({
  itemId: z.string().uuid(),
});
