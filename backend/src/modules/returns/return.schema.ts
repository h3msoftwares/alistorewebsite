import { z } from 'zod';

const returnStatus = z.enum([
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'IN_TRANSIT',
  'RECEIVED',
  'REFUNDED',
  'CANCELLED',
]);

// A customer/guest picks one or more lines from a DELIVERED order and a
// quantity of each — never more than the schema's own per-request cap; the
// real "can this much actually be returned" check is the atomic
// returnedQuantity claim in return.service.ts, not expressible here.
export const createReturnSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({
        orderItemID: z.string().uuid(),
        quantity: z.number().int().min(1),
      })
    )
    .min(1)
    .max(50),
});

export const updateReturnStatusSchema = z.object({
  status: returnStatus,
});

// Same comma-separated-list pattern as order.schema.ts's statusListQuery.
const returnStatusListQuery = z
  .preprocess(
    (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
    z.array(returnStatus).min(1)
  )
  .optional();

export const adminListReturnsQuerySchema = z.object({
  status: returnStatusListQuery,
});

export const returnIdParamSchema = z.object({
  id: z.string().uuid(),
});

// The customer/guest "withdraw my return request" routes need both the
// order id (or track token) and the return id — the return must actually
// belong to that order, checked in return.service.ts, not just here.
export const orderReturnIdParamSchema = z.object({
  id: z.string().uuid(),
  returnId: z.string().uuid(),
});

export const orderTrackTokenReturnIdParamSchema = z.object({
  token: z.string().trim().min(1).max(200),
  returnId: z.string().uuid(),
});
