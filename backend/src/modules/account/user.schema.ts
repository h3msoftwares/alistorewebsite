import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(6).max(30).nullish(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });
