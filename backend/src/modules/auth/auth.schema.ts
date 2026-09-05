import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(6).optional(),
  password: z.string().min(8),
}).refine((data) => data.email || data.phone, {
  message: 'Either email or phone is required',
});

// Login is a hostile surface — bound both fields so a giant body can't be
// forced through express.json's cap into an Argon2 verify. 320 = RFC-max email
// length; 200 comfortably covers any real passphrase. Same caps as
// adminLoginSchema below.
export const loginSchema = z.object({
  identifier: z.string().min(1).max(320), // email or phone
  password: z.string().min(1).max(200),
});

// Admin login carries the same caps for the same reason; kept as its own
// schema so the two doors can diverge later without touching each other.
export const adminLoginSchema = z.object({
  identifier: z.string().min(3).max(320),
  password: z.string().min(1).max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
