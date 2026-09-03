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
