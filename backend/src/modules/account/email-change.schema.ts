import { z } from 'zod';

/**
 * Request an account email change. `currentPassword` is required and
 * verified server-side (see email-change.service.requestEmailChange) — same
 * re-auth bar as change-password, since possession of a valid session alone
 * is not enough to redirect an account's identity.
 */
export const requestEmailChangeSchema = z.object({
  newEmail: z.string().trim().email().max(320).toLowerCase(),
  currentPassword: z.string().min(1).max(200),
  // Only shapes the confirmation link's locale prefix; defaults to 'en'.
  locale: z.enum(['en', 'ar']).default('en'),
});

export const confirmEmailChangeSchema = z.object({
  // 256-bit token, base64url-encoded — ~43 chars. Same bound as verify-email.
  token: z.string().min(1).max(512),
});
