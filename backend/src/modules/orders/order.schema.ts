import { z } from 'zod';
import { REGION_VALUES } from '../../lib/regions';

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
  // Lebanese governorate — drives the delivery-fee calculation.
  deliveryRegion: z.enum(REGION_VALUES),
  deliveryArea: z.string().optional(),
  deliveryNotes: z.string().optional(),
  notes: z.string().optional(),
});

// GET /api/orders/delivery-quote?region=... — a live fee estimate for the
// caller's current cart.
export const deliveryQuoteQuerySchema = z.object({
  region: z.enum(REGION_VALUES),
});

const orderStatus = z.enum([
  'PENDING',
  'CONFIRMED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
]);

export const updateOrderStatusSchema = z.object({ status: orderStatus });

export const adminListOrdersQuerySchema = z.object({
  status: orderStatus.optional(),
});

export const markCollectedSchema = z.object({
  collected: z.boolean(),
});

export const orderIdParamSchema = z.object({
  id: z.string().uuid(),
});
