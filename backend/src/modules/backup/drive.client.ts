// Dependency-free Google Drive v3 REST client (no `googleapis` package) —
// same approach as lib/upload.service.ts's hand-rolled ImageKit signing:
// small enough surface not to justify an SDK.
//
// Scope is `drive.file` (minimal: this app can only see/manage files IT
// created), so a leaked token can't be used to browse the rest of the
// account's Drive. `openid email` is included too, purely to show "Connected
// as x@gmail.com" in the admin panel.
//
// The refresh token has two possible sources, in priority order — and each
// one is tied to a DIFFERENT OAuth client, since a refresh token must be
// redeemed with the same client id/secret that issued it:
//   1. The `DriveCredential` DB row — set by the admin panel's "Connect
//      Google Drive" flow (buildAuthUrl/completeConnection below), which
//      uses the GOOGLE_DRIVE_WEB_CLIENT_* "Web application" OAuth client
//      (needed for a custom callback path — the alternative "Desktop app"
//      client type only supports Google's fixed loopback redirect). Once
//      this row exists at all, it is authoritative: a disconnected state
//      (refreshToken: null) is NOT overridden by the env var below, so
//      "Disconnect" actually disconnects.
//   2. `GOOGLE_DRIVE_REFRESH_TOKEN` env var, paired with the original
//      GOOGLE_DRIVE_CLIENT_* "Desktop app" client — the bootstrap path
//      (minted once via `npm run backup:token`), still used by the GitHub
//      Actions scheduled workflow and as the fallback until an admin ever
//      uses the "Connect" button.
//
// The backup folder id follows the SAME source, and for the same reason a
// refresh token can't cross clients: a folder id belongs to whichever
// account created it, so "connect any Google Drive account" can't hand
// every connected account the one fixed GOOGLE_DRIVE_BACKUP_FOLDER_ID — a
// newly-connected account has no access to a folder some other account
// owns. So: the DB-row path finds-or-creates its OWN folder (by name, see
// ensureAppFolder) the moment an account connects, and stores that folder's
// id on the row; the env-var path keeps using GOOGLE_DRIVE_BACKUP_FOLDER_ID,
// same as before.

import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';
const FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const SCOPE = 'https://www.googleapis.com/auth/drive.file openid email';

const DRIVE_CREDENTIAL_ID = 1;

interface EffectiveConnection {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  folderId: string | null;
}

/** Which refresh token (+ OAuth client + backup folder) is active right
 *  now — see the module-doc priority order above. */
async function getEffectiveConnection(): Promise<EffectiveConnection | null> {
  const row = await prisma.driveCredential.findUnique({ where: { id: DRIVE_CREDENTIAL_ID } });
  if (row) {
    if (!row.refreshToken) return null; // explicitly disconnected
    return {
      refreshToken: row.refreshToken,
      clientId: env.GOOGLE_DRIVE_WEB_CLIENT_ID,
      clientSecret: env.GOOGLE_DRIVE_WEB_CLIENT_SECRET,
      folderId: row.folderId,
    };
  }
  if (env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    return {
      refreshToken: env.GOOGLE_DRIVE_REFRESH_TOKEN,
      clientId: env.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
      folderId: env.GOOGLE_DRIVE_BACKUP_FOLDER_ID || null,
    };
  }
  return null;
}

export async function isConfigured(): Promise<boolean> {
  const conn = await getEffectiveConnection();
  return !!conn && !!conn.clientId && !!conn.clientSecret && !!conn.folderId;
}

async function requireConfigured(): Promise<void> {
  if (!(await isConfigured())) {
    throw new AppError('INTERNAL', 'Google Drive backups are not configured.');
  }
}

export interface DriveConnectionStatus {
  configured: boolean;
  connectedEmail: string | null;
  connectedAt: string | null;
}

/** Everything the "Google Drive connection" card on the Backups page needs. */
export async function getConnectionStatus(): Promise<DriveConnectionStatus> {
  const [row, configured] = await Promise.all([
    prisma.driveCredential.findUnique({ where: { id: DRIVE_CREDENTIAL_ID } }),
    isConfigured(),
  ]);
  return {
    configured,
    connectedEmail: row?.connectedEmail ?? null,
    connectedAt: row?.connectedAt?.toISOString() ?? null,
  };
}

/** Finds (by name) or creates this tool's backup folder in whichever
 *  account `accessToken` belongs to. Under `drive.file` scope a plain
 *  search only ever sees folders THIS app created (or the user explicitly
 *  opened with it) — so on a brand new connection the search naturally
 *  comes back empty and this creates a fresh folder; on a later reconnect
 *  of the same account it finds and reuses the one already there instead
 *  of creating a duplicate. */
async function ensureAppFolder(accessToken: string): Promise<string> {
  const name = env.GOOGLE_DRIVE_FOLDER_NAME;
  const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = encodeURIComponent(`name='${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`${FILES_ENDPOINT}?q=${q}&fields=files(id)&pageSize=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (searchRes.ok) {
    const body = (await searchRes.json()) as { files?: Array<{ id: string }> };
    if (body.files?.[0]) return body.files[0].id;
  }

  const createRes = await fetch(FILES_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!createRes.ok) {
    throw new AppError(
      'INTERNAL',
      `Could not create the Drive backup folder: ${createRes.status} ${await createRes.text().catch(() => '')}`
    );
  }
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

/** The Google consent screen URL for "Connect Google Drive" — `state` is a
 *  short-lived, server-signed token (see backup.controller.ts) so the
 *  callback below can verify this flow was legitimately started by an
 *  authenticated admin, without relying on cookies/headers the browser's
 *  top-level redirect back to us won't carry. */
export function buildAuthUrl(redirectUri: string, state: string): string {
  const url = new URL(AUTH_ENDPOINT);
  // The "Web application" client, not the "Desktop app" one — see the
  // module doc comment at the top of this file.
  url.searchParams.set('client_id', env.GOOGLE_DRIVE_WEB_CLIENT_ID);
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
      client_id: env.GOOGLE_DRIVE_WEB_CLIENT_ID,
      client_secret: env.GOOGLE_DRIVE_WEB_CLIENT_SECRET,
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
    throw new AppError(
      'INTERNAL',
      `Google Drive connect failed: ${body.error_description || body.error || res.status}`
    );
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

  // Not optional, unlike email: without a folder id nothing can ever be
  // uploaded to this connection, so a failure here fails the whole connect.
  const folderId = await ensureAppFolder(body.access_token!);

  await prisma.driveCredential.upsert({
    where: { id: DRIVE_CREDENTIAL_ID },
    create: { id: DRIVE_CREDENTIAL_ID, refreshToken: body.refresh_token, connectedEmail: email, connectedAt: new Date(), folderId },
    update: { refreshToken: body.refresh_token, connectedEmail: email, connectedAt: new Date(), folderId },
  });
  cachedToken = null;

  return { email };
}

/** Revokes the current refresh token at Google (best-effort — an already-
 *  revoked/expired token 400s, which is fine, the goal is achieved either
 *  way) and clears the stored connection (including its folder id — a
 *  reconnect finds-or-creates fresh via ensureAppFolder regardless). Once
 *  this row exists, the GOOGLE_DRIVE_REFRESH_TOKEN env var fallback no
 *  longer applies — see getEffectiveConnection. Google's revoke endpoint
 *  takes just the token, no client id/secret needed. */
export async function disconnect(): Promise<void> {
  const conn = await getEffectiveConnection();
  if (conn) {
    try {
      await fetch(REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: conn.refreshToken }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // best-effort — still clear our own record even if Google's revoke
      // endpoint is unreachable.
    }
  }
  await prisma.driveCredential.upsert({
    where: { id: DRIVE_CREDENTIAL_ID },
    create: { id: DRIVE_CREDENTIAL_ID, refreshToken: null, connectedEmail: null, connectedAt: null, folderId: null },
    update: { refreshToken: null, connectedEmail: null, connectedAt: null, folderId: null },
  });
  cachedToken = null;
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;
// Refresh a little before the token actually expires so a request never
// starts with a token that goes stale mid-flight.
const EXPIRY_BUFFER_MS = 60_000;

/** Test-only seam: clears the cached access token between test cases. */
export function __resetTokenCache(): void {
  cachedToken = null;
}

/** Also returns the effective folder id alongside the token — callers that
 *  need both (uploadFile/listBackups) get them from one place, and it costs
 *  nothing extra: getEffectiveConnection() is a single indexed row read. */
async function getAccessToken(): Promise<{ accessToken: string; folderId: string }> {
  await requireConfigured();
  const conn = (await getEffectiveConnection())!; // requireConfigured() above guarantees this (incl. folderId)
  if (cachedToken && cachedToken.expiresAt - EXPIRY_BUFFER_MS > Date.now()) {
    return { accessToken: cachedToken.accessToken, folderId: conn.folderId! };
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: conn.clientId,
      client_secret: conn.clientSecret,
      refresh_token: conn.refreshToken,
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
    // invalid_grant = the refresh token itself was revoked/expired (e.g. the
    // OAuth consent screen was left in "Testing" mode) — surface a message
    // that points straight at the fix rather than a bare 400.
    if (body.error === 'invalid_grant') {
      throw new AppError(
        'INTERNAL',
        'Google Drive refresh token is invalid or revoked — reconnect via the admin panel or npm run backup:token.'
      );
    }
    throw new AppError('INTERNAL', `Google Drive auth failed: ${body.error_description || body.error || res.status}`);
  }

  const accessToken = body.access_token!;
  const expiresInSec = body.expires_in ?? 3600;
  cachedToken = { accessToken, expiresAt: Date.now() + expiresInSec * 1000 };
  return { accessToken, folderId: conn.folderId! };
}

export interface DriveFile {
  id: string;
  name: string;
  size: number;
  createdTime: string;
}

/** Two-step resumable upload: open a session, then PUT the file bytes to the
 *  returned session URL. Simpler upload types top out around 5MB in
 *  practice for reliability; resumable is the one that behaves for
 *  multi-hundred-MB dumps without special-casing file size here. */
export async function uploadFile(fileBytes: Buffer, name: string): Promise<DriveFile> {
  const { accessToken, folderId } = await getAccessToken();

  const openRes = await fetch(`${UPLOAD_ENDPOINT}?uploadType=resumable&fields=id,name,size,createdTime`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ name, parents: [folderId] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!openRes.ok) {
    throw new AppError('INTERNAL', `Could not open Drive upload session: ${openRes.status} ${await openRes.text().catch(() => '')}`);
  }
  const sessionUrl = openRes.headers.get('Location');
  if (!sessionUrl) {
    throw new AppError('INTERNAL', 'Drive did not return an upload session URL.');
  }

  const putRes = await fetch(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(fileBytes.length) },
    body: fileBytes,
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  if (!putRes.ok) {
    throw new AppError('INTERNAL', `Drive upload failed: ${putRes.status} ${await putRes.text().catch(() => '')}`);
  }
  const file = (await putRes.json()) as { id: string; name: string; size?: string; createdTime: string };
  return { id: file.id, name: file.name, size: Number(file.size ?? 0), createdTime: file.createdTime };
}

/** Every non-trashed file this tool has uploaded into the backup folder,
 *  newest first. */
export async function listBackups(): Promise<DriveFile[]> {
  const { accessToken, folderId } = await getAccessToken();

  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const url =
      `${FILES_ENDPOINT}?q=${q}&fields=nextPageToken,files(id,name,size,createdTime)` +
      `&orderBy=createdTime desc&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new AppError('INTERNAL', `Could not list Drive backups: ${res.status} ${await res.text().catch(() => '')}`);
    }
    const body = (await res.json()) as { nextPageToken?: string; files?: Array<{ id: string; name: string; size?: string; createdTime: string }> };
    for (const f of body.files ?? []) {
      files.push({ id: f.id, name: f.name, size: Number(f.size ?? 0), createdTime: f.createdTime });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);

  return files;
}

/** Downloads a file's raw bytes (`alt=media`) — used by restore to pull a
 *  chosen backup down before running it through `pg_restore`. */
export async function downloadFile(id: string): Promise<Buffer> {
  const { accessToken } = await getAccessToken();
  const res = await fetch(`${FILES_ENDPOINT}/${encodeURIComponent(id)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  if (!res.ok) {
    throw new AppError('INTERNAL', `Could not download Drive file ${id}: ${res.status} ${await res.text().catch(() => '')}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteFile(id: string): Promise<void> {
  const { accessToken } = await getAccessToken();
  const res = await fetch(`${FILES_ENDPOINT}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  // 404 = already gone — not an error for a prune/cleanup caller.
  if (!res.ok && res.status !== 404) {
    throw new AppError('INTERNAL', `Could not delete Drive file ${id}: ${res.status} ${await res.text().catch(() => '')}`);
  }
}
