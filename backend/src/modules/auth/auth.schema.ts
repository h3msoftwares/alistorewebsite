import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(6).optional(),
  password: z.string().min(8),
}).refine((data) => data.email || data.phone, {
  message: 'Either email or phone is required',
});

export const loginSchema = z.object({
  identifier: z.string().min(1), // email or phone
  password: z.string().min(1),
});

// Admin login is a hostile surface — bound both fields so a giant body can't
// be forced through express.json's 100 KB cap into an Argon2 verify. 320 =
// RFC-max email length; 200 comfortably covers any real passphrase.
// (The customer loginSchema above should get the same caps in a follow-up.)
export const adminLoginSchema = z.object({
  identifier: z.string().min(3).max(320),
  password: z.string().min(1).max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
