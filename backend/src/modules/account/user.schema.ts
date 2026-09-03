import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    phone: z.string().min(6).max(30).nullish(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });
