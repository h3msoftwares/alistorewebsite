import { z } from 'zod';

// A built-in Lebanese governorate code or an admin-defined custom zone name
// (see settings). Validated for shape here; that it's a *known* region is
// checked in order.service.ts against the live delivery config.
const regionName = z.string().trim().min(1).max(60);

export const checkoutSchema = z.object({
  // Optional reference to a saved Address; the delivery-* fields below are the
  // snapshot actually stored on the order (captured now so a later edit of the
  // saved address never rewrites order history).
  addressId: z.string().uuid().optional(),
  // When a signed-in shopper types a fresh address at checkout (no addressId),
  // persist it to their address book for next time. Ignored for guests and
  // when addressId is set.
  saveAddress: z.boolean().optional(),
  // Contact email: entered by a guest, or the account email for a signed-in
  // order (snapshotted so it survives the account being deleted).
  guestEmail: z.string().email().optional(),
  deliveryName: z.string().min(1),
  // Kept in step with account/address.schema.ts (phone min 6, addressLine
  // min 3) so any saved address can be checked out with.
  deliveryPhone: z.string().min(6),
  deliveryAddress: z.string().min(3),
  deliveryCity: z.string().min(1),
  // Lebanese governorate — drives the delivery-fee calculation.
  deliveryRegion: regionName,
  deliveryArea: z.string().optional(),
  deliveryNotes: z.string().optional(),
  notes: z.string().optional(),
  // The "verified" ticket from POST /api/checkout/otp/verify. Required
  // unless the caller is logged in with a verified account email — enforced
  // in order.service.ts (needs the account lookup, not expressible here).
  emailVerifyToken: z.string().optional(),
});

// GET /api/orders/delivery-quote?region=... — a live fee estimate for the
// caller's current cart.
export const deliveryQuoteQuerySchema = z.object({
  region: regionName,
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
  flagged: z.coerce.boolean().optional(),
});

export const markCollectedSchema = z.object({
  collected: z.boolean(),
});

export const orderIdParamSchema = z.object({
  id: z.string().uuid(),
});
