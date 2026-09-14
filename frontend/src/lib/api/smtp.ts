import { api } from './client';
import type { SetSmtpCredentialBody, SmtpStatus } from '../types';

// ADMIN-only (not STAFF+ADMIN like the rest of /api/admin) — see
// backend/src/modules/settings/smtp-credential.routes.ts. Never returns the
// app password — only whether something is configured and which address it
// sends as.

export function getSmtpStatus() {
  return api.get<{ status: SmtpStatus }>('/api/admin/smtp/status').then((r) => r.status);
}

/** Verified with a real SMTP handshake server-side before being saved — a
 *  wrong app password surfaces as a 400 here, not a silent future failure. */
export function setSmtpCredential(body: SetSmtpCredentialBody) {
  return api.patch<{ status: SmtpStatus }>('/api/admin/smtp', body).then((r) => r.status);
}

/** Reverts to the SMTP_* environment fallback (if any). */
export function clearSmtpCredential() {
  return api.del<{ status: SmtpStatus }>('/api/admin/smtp').then((r) => r.status);
}
