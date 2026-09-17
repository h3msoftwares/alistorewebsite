// Dependency-free Gmail API v1 REST client (no `googleapis` package) — same
// approach as backup/drive.client.ts's Drive client and lib/upload.service.ts's
// hand-rolled ImageKit signing: small enough surface not to justify an SDK.
//
// Why this exists at all: Railway's free/hobby tier blocks outbound SMTP
// entirely (confirmed live — see docs/DEPLOYMENT.md), so the app can't
// connect to smtp.gmail.com directly. The Gmail API is a plain HTTPS REST
// API, not SMTP, so it isn't blocked — this lets outgoing mail keep using a
// real Gmail address without switching to a third-party email provider (and
// without a domain to verify one).
//
// Scope is `gmail.send` only (send-only — this app can never read the
// connected account's mail), plus `openid email` purely to show "Connected
// as x@gmail.com" in the admin panel. Uses its own, separate Google Cloud
// OAuth "Web application" client (GMAIL_SEND_CLIENT_ID/_SECRET) — a
// different Google Cloud project than the one backing Google Drive backups,
// so the two connections are entirely independent (disconnecting one never
// affects the other).

import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const SCOPE = 'https://www.googleapis.com/auth/gmail.send openid email';

const GMAIL_CREDENTIAL_ID = 1;

export async function isConfigured(): Promise<boolean> {
  if (!env.GMAIL_SEND_CLIENT_ID || !env.GMAIL_SEND_CLIENT_SECRET) return false;
  const row = await prisma.gmailSendCredential.findUnique({ where: { id: GMAIL_CREDENTIAL_ID } });
  return !!row?.refreshToken;
}

export interface GmailConnectionStatus {
  configured: boolean;
  connectedEmail: string | null;
  connectedAt: string | null;
}

/** Everything the admin panel's "Connect Gmail account" card needs. */
export async function getConnectionStatus(): Promise<GmailConnectionStatus> {
  const row = await prisma.gmailSendCredential.findUnique({ where: { id: GMAIL_CREDENTIAL_ID } });
  return {
    configured: await isConfigured(),
    connectedEmail: row?.connectedEmail ?? null,
    connectedAt: row?.connectedAt?.toISOString() ?? null,
  };
}

/** The Google consent screen URL for "Connect Gmail account" — `state` is a
 *  short-lived, server-signed token (see mail.controller.ts) so the callback
 *  below can verify this flow was legitimately started by an authenticated
 *  admin, without relying on cookies/headers the browser's top-level
 *  redirect back to us won't carry. Same pattern as backup/drive.client.ts's
 *  buildAuthUrl. */
export function buildAuthUrl(redirectUri: string, state: string): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', env.GMAIL_SEND_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE);
  // Forces a refresh token even if this Google account has already
  // consented before (a repeat consent would otherwise return none).
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

/** Exchanges an authorization code for tokens, fetches the account email,
 *  and persists the connection — the callback route's entire job after it
 *  has verified `state`. */
export async function completeConnection(code: string, redirectUri: string): Promise<{ email: string | null }> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_SEND_CLIENT_ID,
      client_secret: env.GMAIL_SEND_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.refresh_token || !body.access_token) {
    throw new AppError('INTERNAL', `Gmail connect failed: ${body.error_description || body.error || res.status}`);
  }

  let email: string | null = null;
  try {
    const infoRes = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${body.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (infoRes.ok) {
      const info = (await infoRes.json()) as { email?: string };
      email = info.email ?? null;
    }
  } catch {
    // cosmetic only ("connected as x@gmail.com") — a failure here doesn't
    // affect the connection itself.
  }

  await prisma.gmailSendCredential.upsert({
    where: { id: GMAIL_CREDENTIAL_ID },
    create: { id: GMAIL_CREDENTIAL_ID, refreshToken: body.refresh_token, connectedEmail: email, connectedAt: new Date() },
    update: { refreshToken: body.refresh_token, connectedEmail: email, connectedAt: new Date() },
  });
  cachedToken = null;

  return { email };
}

/** Revokes the current refresh token at Google (best-effort — an already-
 *  revoked/expired token 400s, which is fine, the goal is achieved either
 *  way) and clears the stored connection. */
export async function disconnect(): Promise<void> {
  const row = await prisma.gmailSendCredential.findUnique({ where: { id: GMAIL_CREDENTIAL_ID } });
  if (row?.refreshToken) {
    try {
      await fetch(REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: row.refreshToken }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // best-effort — still clear our own record even if Google's revoke
      // endpoint is unreachable.
    }
  }
  await prisma.gmailSendCredential.upsert({
    where: { id: GMAIL_CREDENTIAL_ID },
    create: { id: GMAIL_CREDENTIAL_ID, refreshToken: null, connectedEmail: null, connectedAt: null },
    update: { refreshToken: null, connectedEmail: null, connectedAt: null },
  });
  cachedToken = null;
}

let cachedToken: { accessToken: string; email: string; expiresAt: number } | null = null;
// Refresh a little before the token actually expires so a send never starts
// with a token that goes stale mid-flight.
const EXPIRY_BUFFER_MS = 60_000;

/** Test-only seam: clears the cached access token between test cases. */
export function __resetTokenCache(): void {
  cachedToken = null;
}

async function getAccessToken(): Promise<{ accessToken: string; email: string }> {
  if (cachedToken && cachedToken.expiresAt - EXPIRY_BUFFER_MS > Date.now()) {
    return cachedToken;
  }

  const row = await prisma.gmailSendCredential.findUnique({ where: { id: GMAIL_CREDENTIAL_ID } });
  if (!row?.refreshToken) {
    throw new AppError('INTERNAL', 'Gmail sending is not connected.');
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_SEND_CLIENT_ID,
      client_secret: env.GMAIL_SEND_CLIENT_SECRET,
      refresh_token: row.refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok) {
    if (body.error === 'invalid_grant') {
      throw new AppError(
        'INTERNAL',
        'Gmail refresh token is invalid or revoked — reconnect via the admin Mail page.'
      );
    }
    throw new AppError('INTERNAL', `Gmail auth failed: ${body.error_description || body.error || res.status}`);
  }

  const accessToken = body.access_token!;
  const expiresInSec = body.expires_in ?? 3600;
  cachedToken = { accessToken, email: row.connectedEmail ?? '', expiresAt: Date.now() + expiresInSec * 1000 };
  return cachedToken;
}

export interface GmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

// RFC 2822 header values (From/To/Subject) can't carry raw UTF-8 — encode
// non-ASCII ones as RFC 2047 "encoded-word"s (=?UTF-8?B?...?=) so a Gmail
// "Ali'sStore" containing (or bilingual subjects containing) Arabic renders
// correctly instead of getting mangled by mail clients expecting ASCII.
function encodeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function buildMimeMessage(msg: GmailMessage): string {
  const boundary = `----alistore-${Date.now().toString(36)}`;
  const lines = [
    `From: ${encodeHeaderValue(msg.from)}`,
    `To: ${encodeHeaderValue(msg.to)}`,
    `Subject: ${encodeHeaderValue(msg.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(msg.text, 'utf8').toString('base64'),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(msg.html, 'utf8').toString('base64'),
    `--${boundary}--`,
  ];
  return lines.join('\r\n');
}

// Gmail API requires the standard base64url alphabet (RFC 4648 §5), not
// plain base64 — +/ and padding would make the raw field invalid.
function base64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Sends one email through the connected Gmail account. Mirrors nodemailer's
 *  `transporter.sendMail({from, to, subject, text, html})` shape closely
 *  enough that mailer.ts's callers don't need to change. */
export async function sendMail(msg: GmailMessage): Promise<{ id: string }> {
  const { accessToken } = await getAccessToken();
  const raw = base64Url(buildMimeMessage(msg));

  const res = await fetch(SEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new AppError('INTERNAL', `Gmail send failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
  const body = (await res.json()) as { id: string };
  return { id: body.id };
}
