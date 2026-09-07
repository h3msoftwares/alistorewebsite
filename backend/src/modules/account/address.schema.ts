import { z } from 'zod';

export const createAddressSchema = z.object({
  // Optional: the storefront no longer collects a separate recipient name —
  // it defaults to the account holder's name (see address.service). Kept in
  // the schema so an admin/API client can still set a distinct recipient.
  fullName: z.string().min(1).max(120).optional(),
  phone: z.string().min(6).max(30),
  addressLine: z.string().min(3).max(300),
  city: z.string().min(1).max(120),
  // Delivery region — a built-in governorate code or a custom zone name (see
  // settings). Lets the checkout form prefill the delivery region.
  region: z.string().trim().min(1).max(60).optional(),
  area: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  isDefault: z.boolean().default(false),
});

export const updateAddressSchema = createAddressSchema.partial();

export const addressIdParamSchema = z.object({
  id: z.string().uuid(),
});
