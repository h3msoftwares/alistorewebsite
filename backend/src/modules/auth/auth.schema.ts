import { z } from 'zod';
import { createAddressSchema } from '../account/address.schema';

// Registration requires an email (verification is email-based) and a full
// delivery address up front — no "skip for now". The address field
// constraints reuse the canonical `createAddressSchema`, minus `isDefault`
// (forced true server-side for the first address) and `fullName` (the
// recipient defaults to the account holder's name). The delivery-address
// `phone` is the account's contact number — there is no separate top-level
// phone field.
export const registerSchema = z.object({
  // Lower-cased so `Foo@X.com` and `foo@x.com` can't become two accounts, and
  // so login / forgot-password / resend all resolve regardless of the casing
  // the user types.
  email: z.string().email().max(320).toLowerCase(),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1).max(120),
  // `region` (the governorate) rides along on the address so it prefills the
  // checkout delivery region — see auth.service.register(). Optional here, as
  // on the generic address schema; the sign-up form makes it a required field.
  address: createAddressSchema.omit({ isDefault: true, fullName: true }),
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
  refreshToken: z.string().min(1).max(512),
});

// Step-up re-auth: a signed-in user re-enters just their password. Same
// bound as the login password field.
export const stepUpSchema = z.object({
  password: z.string().min(1).max(200),
});
