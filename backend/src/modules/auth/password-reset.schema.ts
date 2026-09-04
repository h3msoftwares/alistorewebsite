import { z } from 'zod';

// Delivery is email-only (no SMS provider is wired) — unlike loginSchema's
// identifier (email or phone), this is deliberately keyed on `email`.
export const forgotPasswordSchema = z.object({
  email: z.string().email(),
  // Only used to build the link in the email; not security-sensitive, so
  // it's validated loosely against the app's locales and defaults to 'en'.
  locale: z.enum(['en', 'ar']).default('en'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(512),
  // Same floor as registerSchema.password — it's the same credential, just
  // being replaced.
  newPassword: z.string().min(8),
});
