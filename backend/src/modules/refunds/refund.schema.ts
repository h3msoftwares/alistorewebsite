import { z } from 'zod';

// Store calendar dates in Beirut, independent of the browser/server UTC offset.
export function payoutToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Beirut', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const optionalText = z.string().trim().max(1000).nullish().transform(value => value || null);
export const cashPayoutSchema = z.object({
  payerName: z.string().trim().min(1).max(200),
  paidOn: z.iso.date().optional().transform(value => value ?? payoutToday())
    .refine(value => value <= payoutToday(), 'Payout date cannot be in the future'),
  reference: optionalText,
  note: optionalText,
}).strict();
export type CashPayoutInput = z.input<typeof cashPayoutSchema>;
export const createGoodwillSchema = z.object({
  amountCents: z.number().int().positive().max(999999999999),
  reason: z.string().trim().min(1).max(1000),
  paidNow: z.boolean().default(false),
  payout: cashPayoutSchema.optional(),
}).strict().superRefine((body, ctx) => {
  if (body.paidNow !== !!body.payout) ctx.addIssue({ code: 'custom', path: ['payout'], message: 'Paid now requires cash payout details; owed refunds do not accept a payout' });
});
export const cancelGoodwillSchema = z.object({ reason: z.string().trim().min(1).max(1000) }).strict();
export const goodwillParamSchema = z.object({ id: z.string().uuid(), goodwillId: z.string().uuid() });
