// In-memory access token, mirrored from the Redux auth slice by StoreProvider.
// The refresh token itself is an httpOnly cookie the browser sends automatically
// — only the short-lived access token lives here, and only on the client.

type Listener = (token: string | null) => void;

let accessToken: string | null = null;
const listeners = new Set<Listener>();

export function getAccessToken(): string | null {
  // Never expose a token during SSR — server components fetch public data only.
  if (typeof window === 'undefined') return null;
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  if (token === accessToken) return;
  accessToken = token;
  for (const l of listeners) l(token);
}

export function subscribeAccessToken(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
