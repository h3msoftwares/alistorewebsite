import { api } from './client';

// ADMIN-only — see backend/src/modules/mail/mail.routes.ts. Sends outgoing
// mail via the Gmail API (HTTPS) instead of SMTP, which Railway's free/
// hobby tier blocks outright — see gmail.client.ts's module doc.

export interface GmailConnectionStatus {
  configured: boolean;
  connectedEmail: string | null;
  connectedAt: string | null;
}

export function getGmailStatus() {
  return api.get<GmailConnectionStatus>('/api/admin/mail/gmail/status');
}

/** Returns the Google consent URL to navigate a POPUP window to (not the
 *  main tab — the consent screen must be a top-level page). Google redirects
 *  back to gmail-connect-result/page.tsx, which posts the result back via
 *  postMessage and closes itself. */
export function getGmailConnectUrl() {
  return api.get<{ url: string }>('/api/admin/mail/gmail/connect').then((r) => r.url);
}

export function disconnectGmail() {
  return api.post<{ ok: true }>('/api/admin/mail/gmail/disconnect');
}
