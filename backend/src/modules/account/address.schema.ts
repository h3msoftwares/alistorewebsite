import { z } from 'zod';

export const createAddressSchema = z.object({
  fullName: z.string().min(1).max(120),
  phone: z.string().min(6).max(30),
  addressLine: z.string().min(3).max(300),
  city: z.string().min(1).max(120),
  area: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  isDefault: z.boolean().default(false),
});

export const updateAddressSchema = createAddressSchema.partial();

export const addressIdParamSchema = z.object({
  id: z.string().uuid(),
});
