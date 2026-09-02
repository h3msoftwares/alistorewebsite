import { z } from 'zod';

export const checkoutSchema = z.object({
  // Guest checkout requires these; logged-in users may pass addressId instead.
  addressId: z.string().uuid().optional(),
  guestName: z.string().min(1).optional(),
  guestPhone: z.string().min(6).optional(),
  guestEmail: z.string().email().optional(),
  deliveryText: z.string().min(5), // free-text delivery address/notes — owner delivers, no zone system
  notes: z.string().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']),
});

export const markCollectedSchema = z.object({
  collected: z.boolean(),
});

export const orderIdParamSchema = z.object({
  id: z.string().uuid(),
});
