import { z } from 'zod';

export const addCartItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1),
});

export const cartItemParamSchema = z.object({
  itemId: z.string().uuid(),
});
