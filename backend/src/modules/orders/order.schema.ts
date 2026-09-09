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
  guestEmail: z.string().email().max(320).optional(),
  // Bounds kept in step with account/address.schema.ts so any saved address
  // can be checked out with, and a direct API caller can't stuff ~100 KB
  // (the express.json cap) into a field that's stored on the order and
  // rendered in the admin UI / confirmation emails.
  deliveryName: z.string().trim().min(1).max(120),
  deliveryPhone: z.string().trim().min(6).max(30),
  deliveryAddress: z.string().trim().min(3).max(300),
  deliveryCity: z.string().trim().min(1).max(120),
  // Lebanese governorate — drives the delivery-fee calculation.
  deliveryRegion: regionName,
  deliveryArea: z.string().trim().max(120).optional(),
  deliveryNotes: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).optional(),
  // The "verified" ticket from POST /api/checkout/otp/verify. Required
  // unless the caller is logged in with a verified account email — enforced
  // in order.service.ts (needs the account lookup, not expressible here).
  emailVerifyToken: z.string().max(512).optional(),
  // Optional coupon code. If present it must resolve to an active, in-window
  // coupon (checked in order.service.ts) or the checkout is rejected.
  couponCode: z.string().trim().min(1).max(40).optional(),
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

export const updateOrderStatusSchema = z.object({
  status: orderStatus,
  // Optional "arrives in about N days" estimate the admin sets — typically
  // alongside a move to SHIPPED, but accepted on any status change. null clears it.
  estimatedDeliveryDays: z.number().int().min(0).max(90).nullish(),
});

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

export const orderTrackTokenParamSchema = z.object({
  token: z.string().trim().min(1).max(200),
});

// POST /api/orders/lookup — the guest manual-lookup fallback. `contact` is
// whichever of email/phone was used at checkout; order.service.ts checks
// both without the caller needing to say which.
export const orderLookupSchema = z.object({
  orderNumber: z.string().trim().min(1).max(40),
  contact: z.string().trim().min(1).max(320),
});
