import type { Request } from 'express';

/** Standard error body for a tripped rate limiter — same shape the AppError
 *  handler emits, so clients see one consistent envelope. */
export const RATE_LIMITED_BODY = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' },
};

/**
 * `keyGenerator` for a per-email rate limiter. Keyed on the lowercased,
 * trimmed `email` field of an already-validated body (mount it AFTER
 * `validate()` so a malformed body 400s before it can burn a bucket).
 *
 * It fires identically for a real or made-up address, so it leaks nothing
 * about account existence — only "this exact string has been asked about a
 * lot lately". Used by forgot-password, register, and resend-verification to
 * stop one victim's inbox being flooded from many rotating IPs.
 */
export function emailRateLimitKey(req: Request): string {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  return email.trim().toLowerCase() || 'unknown';
}
