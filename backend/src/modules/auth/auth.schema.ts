import { z } from 'zod';
import { createAddressSchema } from '../account/address.schema';

// Registration now requires an email (verification is email-based), a phone,
// and a full delivery address up front — no "skip for now". The address field
// constraints reuse the canonical `createAddressSchema` (minus `isDefault`,
// which is forced true server-side for the first address).
export const registerSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120),
  phone: z.string().min(6).max(30),
  address: createAddressSchema.omit({ isDefault: true }),
  // Only shapes the link in the verification email; defaults to 'en'.
  locale: z.enum(['en', 'ar']).default('en'),
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
