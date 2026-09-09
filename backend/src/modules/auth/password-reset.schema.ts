import { z } from 'zod';

// Delivery is email-only (no SMS provider is wired) — unlike loginSchema's
// identifier (email or phone), this is deliberately keyed on `email`.
export const forgotPasswordSchema = z.object({
  // Lower-cased to match how accounts are stored (see auth.schema.ts).
  email: z.string().email().toLowerCase(),
  // Only used to build the link in the email; not security-sensitive, so
  // it's validated loosely against the app's locales and defaults to 'en'.
  locale: z.enum(['en', 'ar']).default('en'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(512),
  // Same bounds as registerSchema.password / changePasswordSchema.newPassword
  // — it's the same credential, just being replaced. The max keeps a giant
  // body from being forced through an Argon2 hash.
  newPassword: z.string().min(8).max(200),
});
