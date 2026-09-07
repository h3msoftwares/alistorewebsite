import { z } from 'zod';

export const blacklistTypeSchema = z.enum(['PHONE', 'EMAIL', 'IP']);

export const createBlacklistEntrySchema = z.object({
  type: blacklistTypeSchema,
  value: z.string().min(1).max(320),
  reason: z.string().max(500).optional(),
});

export const blacklistIdParamSchema = z.object({
  id: z.string().uuid(),
});
