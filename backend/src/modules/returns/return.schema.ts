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
  expectedRefundCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
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
  merchandiseRefundCents: z.number().int().nonnegative().max(999999999999).optional(),
  refundAdjustmentReason: z.string().trim().min(1).max(1000).optional(),
  deliveryRefundCents: z.number().int().nonnegative().max(999999999999).optional(),
  deliveryRefundReason: z.string().trim().min(1).max(1000).optional(),
}).superRefine((body, ctx) => {
  if (body.status !== 'REFUNDED' && Object.keys(body).some(key => key !== 'status')) {
    ctx.addIssue({ code: 'custom', message: 'Refund choices are only allowed when marking refunded' });
  }
  if ((body.deliveryRefundCents ?? 0) > 0 && !body.deliveryRefundReason) {
    ctx.addIssue({ code: 'custom', path: ['deliveryRefundReason'], message: 'Delivery refund reason is required' });
  }
});

export type RefundMarkingInput = Pick<z.infer<typeof updateReturnStatusSchema>,
  'merchandiseRefundCents' | 'refundAdjustmentReason' | 'deliveryRefundCents' | 'deliveryRefundReason'>;

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
