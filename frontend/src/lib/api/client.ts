import { getAccessToken, setAccessToken } from './token';
import { ApiError } from './errors';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Attach the bearer access token. Default true. */
  auth?: boolean;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const base = `${API_URL}${path}`;
  if (!query) return base;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

// ---- CSRF (double-submit cookie) ----
// The API sets a non-httpOnly `csrfToken` cookie; every state-changing
// request must echo it in the `X-CSRF-Token` header. A cross-site page can
// send the cookie but can neither read it nor set a custom header.

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Cached in memory so a cross-origin SPA that can't read the API's cookie
// (different domain) still has the value — GET /api/csrf returns it in the
// body too. The double-submit check on the server compares this against the
// cookie it holds, which the browser sends back on same-site requests.
let csrfToken: string | null = null;

async function primeCsrfToken(): Promise<string | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch(`${API_URL}/api/csrf`, { credentials: 'include' });
    if (res.ok) {
      const data = (await res.json()) as { csrfToken?: string | null };
      csrfToken = data.csrfToken ?? readCookie('csrfToken');
    }
  } catch {
    /* offline / API down — the caller's own request will surface the error */
  }
  return csrfToken;
}

/** The current CSRF token: the cached value, else the cookie, else primed
 *  with one GET /api/csrf. */
async function getCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  csrfToken = readCookie('csrfToken');
  if (csrfToken) return csrfToken;
  return primeCsrfToken();
}

/** Test seam — drop the in-memory CSRF token so the next request re-reads
 *  the cookie / re-primes. */
export function resetCsrfToken(): void {
  csrfToken = null;
}

// A single in-flight refresh shared by every 401'd request, so a burst of
// parallel calls triggers exactly one POST /api/auth/refresh.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          setAccessToken(null);
          return false;
        }
        const data = (await res.json()) as { accessToken?: string };
        setAccessToken(data.accessToken ?? null);
        return Boolean(data.accessToken);
      } catch {
        setAccessToken(null);
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiRequest<T>(
  method: string,
  path: string,
  opts: RequestOptions = {},
  retry = true
): Promise<T> {
  const headers: Record<string, string> = { ...opts.headers };

  const token = getAccessToken();
  if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`;

  const upper = method.toUpperCase();
  if (upper !== 'GET' && upper !== 'HEAD' && upper !== 'OPTIONS') {
    const csrf = await getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  let payload: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(opts.body);
  }

  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers,
    body: payload,
    credentials: 'include',
    signal: opts.signal,
  });

  // Access token expired: refresh once (cookie-backed) and replay the request.
  if (res.status === 401 && retry && opts.auth !== false && !path.startsWith('/api/auth/')) {
    const ok = await refreshAccessToken();
    if (ok) return apiRequest<T>(method, path, opts, false);
  }

  if (res.status === 204 || res.status === 205) return undefined as T;

  const text = await res.text();
  let data: unknown;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  // Stale/absent CSRF token (e.g. the session cookie expired): re-prime once
  // and replay. `retry` guards against a loop.
  if (
    res.status === 403 &&
    retry &&
    upper !== 'GET' &&
    upper !== 'HEAD' &&
    upper !== 'OPTIONS' &&
    /csrf/i.test(text)
  ) {
    csrfToken = null;
    const fresh = await primeCsrfToken();
    if (fresh) return apiRequest<T>(method, path, opts, false);
  }

  if (!res.ok) {
    const envelope = (data as { error?: { code: string; message: string; meta?: unknown } })?.error;
    throw new ApiError(res.status, envelope, `${method} ${path} failed`);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => apiRequest<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>('POST', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>('PATCH', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>('PUT', path, { ...opts, body }),
  del: <T = void>(path: string, opts?: RequestOptions) => apiRequest<T>('DELETE', path, opts),
};

// Exposed so the auth bootstrap hook can prime the token from the cookie.
export { refreshAccessToken };
