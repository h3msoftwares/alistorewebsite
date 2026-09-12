import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { prisma } from '../../src/config/prisma';

// drive.client.ts reads several GOOGLE_DRIVE_* fields off `env`; mock the
// module directly rather than relying on process.env being empty in this
// test run — the real backend/.env's values are already loaded into this
// worker by the time these tests execute (Prisma's own env loading during
// global-setup's `prisma migrate deploy` subprocess doesn't leak back, but
// something upstream of it evidently does), so asserting against a "nothing
// configured" ambient state is not reliable here.
const BLANK_ENV = {
  GOOGLE_DRIVE_CLIENT_ID: '',
  GOOGLE_DRIVE_CLIENT_SECRET: '',
  GOOGLE_DRIVE_BACKUP_FOLDER_ID: '',
  GOOGLE_DRIVE_REFRESH_TOKEN: '',
  GOOGLE_DRIVE_WEB_CLIENT_ID: '',
  GOOGLE_DRIVE_WEB_CLIENT_SECRET: '',
  GOOGLE_DRIVE_FOLDER_NAME: 'Database Backups',
};
const mockEnv = { ...BLANK_ENV };
vi.mock('../../src/config/env', () => ({ env: mockEnv }));

const drive = await import('../../src/modules/backup/drive.client');

function resetMockEnv() {
  Object.assign(mockEnv, BLANK_ENV);
}

/** Configures the "Desktop app" client (env-var refresh token path). */
function configureEnv() {
  Object.assign(mockEnv, {
    GOOGLE_DRIVE_CLIENT_ID: 'client-id',
    GOOGLE_DRIVE_CLIENT_SECRET: 'client-secret',
    GOOGLE_DRIVE_BACKUP_FOLDER_ID: 'folder-id',
  });
}

/** Configures the "Web application" client (admin-panel connect flow). Note:
 *  no GOOGLE_DRIVE_BACKUP_FOLDER_ID here — the DB-row path gets its folder
 *  id from the row itself (ensureAppFolder at connect time), not this var. */
function configureWebEnv() {
  Object.assign(mockEnv, {
    GOOGLE_DRIVE_WEB_CLIENT_ID: 'web-client-id',
    GOOGLE_DRIVE_WEB_CLIENT_SECRET: 'web-client-secret',
  });
}

describe('drive.client — isConfigured / getConnectionStatus (DB row overrides env)', () => {
  beforeEach(() => {
    drive.__resetTokenCache();
    resetMockEnv();
  });

  it('is not configured with nothing set', async () => {
    expect(await drive.isConfigured()).toBe(false);
    expect(await drive.getConnectionStatus()).toEqual({
      configured: false,
      connectedEmail: null,
      connectedAt: null,
    });
  });

  it('client id/secret/folder set but no refresh token anywhere: still not configured', async () => {
    configureEnv();
    expect(await drive.isConfigured()).toBe(false);
  });

  it('falls back to the env var refresh token when no DB row exists', async () => {
    configureEnv();
    mockEnv.GOOGLE_DRIVE_REFRESH_TOKEN = 'env-refresh-token';
    expect(await drive.isConfigured()).toBe(true);
  });

  it('a connected DB row (web client) makes it configured, independent of the desktop-client env var', async () => {
    configureWebEnv();
    await prisma.driveCredential.create({
      data: {
        id: 1,
        refreshToken: 'db-refresh-token',
        connectedEmail: 'owner@example.com',
        connectedAt: new Date(),
        folderId: 'db-folder-id',
      },
    });

    expect(await drive.isConfigured()).toBe(true);
    const status = await drive.getConnectionStatus();
    expect(status.connectedEmail).toBe('owner@example.com');
    expect(status.connectedAt).not.toBeNull();
  });

  it('a DB row exists but has no folder id yet: not configured', async () => {
    // Shouldn't happen in practice (completeConnection always sets one),
    // but a row without a folder id must never be treated as usable.
    configureWebEnv();
    await prisma.driveCredential.create({
      data: { id: 1, refreshToken: 'db-refresh-token', connectedEmail: 'owner@example.com', connectedAt: new Date() },
    });
    expect(await drive.isConfigured()).toBe(false);
  });

  it('a DB row exists but the web client env vars are unset: not configured', async () => {
    // A misconfiguration to catch: someone connected via the panel once,
    // then the GOOGLE_DRIVE_WEB_CLIENT_* vars got lost from the environment.
    await prisma.driveCredential.create({
      data: {
        id: 1,
        refreshToken: 'db-refresh-token',
        connectedEmail: 'owner@example.com',
        connectedAt: new Date(),
        folderId: 'db-folder-id',
      },
    });
    expect(await drive.isConfigured()).toBe(false);
  });

  it('a disconnected DB row (refreshToken: null) is NOT overridden by the env var', async () => {
    configureEnv();
    mockEnv.GOOGLE_DRIVE_REFRESH_TOKEN = 'env-refresh-token';
    await prisma.driveCredential.create({
      data: { id: 1, refreshToken: null, connectedEmail: null, connectedAt: null },
    });

    expect(await drive.isConfigured()).toBe(false);
    const status = await drive.getConnectionStatus();
    expect(status.connectedEmail).toBeNull();
    expect(status.connectedAt).toBeNull();
  });
});

describe('drive.client — buildAuthUrl', () => {
  beforeEach(() => {
    resetMockEnv();
    configureWebEnv();
  });

  it('builds a consent URL carrying the redirect_uri, scope, state, and the WEB client id (not the desktop one)', () => {
    const url = drive.buildAuthUrl('https://api.example.com/api/admin/backup/drive/callback', 'signed-state-token');
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(parsed.searchParams.get('client_id')).toBe('web-client-id');
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://api.example.com/api/admin/backup/drive/callback');
    expect(parsed.searchParams.get('state')).toBe('signed-state-token');
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('prompt')).toBe('consent');
    expect(parsed.searchParams.get('scope')).toContain('drive.file');
  });
});

describe('drive.client — completeConnection / disconnect', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetMockEnv();
    configureWebEnv();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('persists the refresh token, email and a found-or-created folder id on a successful exchange, using the WEB client credentials', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/token')) {
        const body = new URLSearchParams(init?.body as string);
        expect(body.get('client_id')).toBe('web-client-id');
        expect(body.get('client_secret')).toBe('web-client-secret');
        return {
          ok: true,
          json: async () => ({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 }),
        } as Response;
      }
      if (url.includes('userinfo')) {
        return { ok: true, json: async () => ({ email: 'owner@example.com' }) } as Response;
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
        // ensureAppFolder: a GET search (nothing found yet on a fresh
        // account) followed by a POST create.
        if (!init?.method || init.method === 'GET') {
          return { ok: true, json: async () => ({ files: [] }) } as Response;
        }
        if (init.method === 'POST') {
          return { ok: true, json: async () => ({ id: 'created-folder-1' }) } as Response;
        }
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await drive.completeConnection('auth-code', 'https://api.example.com/callback');
    expect(result.email).toBe('owner@example.com');

    const row = await prisma.driveCredential.findUnique({ where: { id: 1 } });
    expect(row?.refreshToken).toBe('refresh-1');
    expect(row?.connectedEmail).toBe('owner@example.com');
    expect(row?.folderId).toBe('created-folder-1');
  });

  it('reuses an existing folder (found by name) instead of creating a duplicate on a reconnect', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/token')) {
        return {
          ok: true,
          json: async () => ({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 }),
        } as Response;
      }
      if (url.includes('userinfo')) {
        return { ok: true, json: async () => ({ email: 'owner@example.com' }) } as Response;
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
        return { ok: true, json: async () => ({ files: [{ id: 'existing-folder-1' }] }) } as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await drive.completeConnection('auth-code', 'https://api.example.com/callback');
    const row = await prisma.driveCredential.findUnique({ where: { id: 1 } });
    expect(row?.folderId).toBe('existing-folder-1');
  });

  it('throws without persisting anything when the token exchange fails', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant', error_description: 'Bad code' }),
    })) as unknown as typeof fetch;
    global.fetch = fetchMock;

    await expect(drive.completeConnection('bad-code', 'https://api.example.com/callback')).rejects.toThrow();
    const row = await prisma.driveCredential.findUnique({ where: { id: 1 } });
    expect(row).toBeNull();
  });

  it('disconnect clears a stored connection and revokes at Google', async () => {
    await prisma.driveCredential.create({
      data: { id: 1, refreshToken: 'refresh-1', connectedEmail: 'owner@example.com', connectedAt: new Date() },
    });
    const fetchMock = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch;
    global.fetch = fetchMock;

    await drive.disconnect();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('revoke'),
      expect.objectContaining({ method: 'POST' })
    );
    const row = await prisma.driveCredential.findUnique({ where: { id: 1 } });
    expect(row?.refreshToken).toBeNull();
    expect(row?.connectedEmail).toBeNull();
  });
});

describe('drive.client — getAccessToken uses the right client per token source', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    drive.__resetTokenCache();
    resetMockEnv();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function fetchMockCapturingTokenRequest(capture: { clientId?: string; clientSecret?: string; refreshToken?: string }) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/token')) {
        const body = new URLSearchParams(init?.body as string);
        capture.clientId = body.get('client_id') ?? undefined;
        capture.clientSecret = body.get('client_secret') ?? undefined;
        capture.refreshToken = body.get('refresh_token') ?? undefined;
        return { ok: true, json: async () => ({ access_token: 'access-1', expires_in: 3600 }) } as Response;
      }
      if (url.includes('/files')) {
        return { ok: true, json: async () => ({ files: [] }) } as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
  }

  it('a Desktop-client env-var token refreshes with the Desktop client id/secret', async () => {
    configureEnv();
    mockEnv.GOOGLE_DRIVE_REFRESH_TOKEN = 'env-refresh-token';
    const capture: { clientId?: string; clientSecret?: string; refreshToken?: string } = {};
    global.fetch = fetchMockCapturingTokenRequest(capture);

    await drive.listBackups();

    expect(capture).toEqual({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'env-refresh-token',
    });
  });

  it('a Web-client DB-row token refreshes with the Web client id/secret', async () => {
    configureWebEnv();
    await prisma.driveCredential.create({
      data: {
        id: 1,
        refreshToken: 'db-refresh-token',
        connectedEmail: 'owner@example.com',
        connectedAt: new Date(),
        folderId: 'db-folder-id',
      },
    });
    const capture: { clientId?: string; clientSecret?: string; refreshToken?: string } = {};
    global.fetch = fetchMockCapturingTokenRequest(capture);

    await drive.listBackups();

    expect(capture).toEqual({
      clientId: 'web-client-id',
      clientSecret: 'web-client-secret',
      refreshToken: 'db-refresh-token',
    });
  });
});
