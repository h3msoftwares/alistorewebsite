import { z } from 'zod';

export const markCollectedSchema = z.discriminatedUnion('collected', [
  z.object({
    collected: z.literal(true),
    amount: z.number().positive().max(9999999999.99).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001, 'Use at most two decimal places'),
    currency: z.string().trim().min(1).max(10),
    collectedAt: z.iso.datetime({ offset: true }),
    collectorName: z.string().trim().min(1).max(200),
    reference: z.string().trim().max(500).nullish().transform((reference) => reference || null),
    note: z.string().trim().max(2000).optional(),
  }).strict(),
  z.object({
    collected: z.literal(false),
    collectionID: z.string().uuid(),
    reason: z.string().trim().min(1).max(2000),
  }).strict(),
]);
export type CollectionInput = z.input<typeof markCollectedSchema>;
