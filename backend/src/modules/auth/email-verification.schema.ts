import { z } from 'zod';

export const verifyEmailSchema = z.object({
  // 256-bit token, base64url-encoded — ~43 chars. Bound it like the reset
  // token so a huge body can't be forced through.
  token: z.string().min(1).max(512),
});

export const resendVerificationSchema = z.object({
  email: z.string().email().max(320).toLowerCase(),
  // Only shapes the link in the email; defaults to 'en'.
  locale: z.enum(['en', 'ar']).default('en'),
});
