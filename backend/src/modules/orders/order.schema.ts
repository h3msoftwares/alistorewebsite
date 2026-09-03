import { z } from 'zod';

export const checkoutSchema = z.object({
  // Optional reference to a saved Address; the delivery-* fields below are the
  // snapshot actually stored on the order (captured now so a later edit of the
  // saved address never rewrites order history).
  addressId: z.string().uuid().optional(),
  guestEmail: z.string().email().optional(), // contact email for a guest order
  deliveryName: z.string().min(1),
  deliveryPhone: z.string().min(6),
  deliveryAddress: z.string().min(5),
  deliveryCity: z.string().min(1),
  deliveryArea: z.string().optional(),
  deliveryNotes: z.string().optional(),
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
