// Minimal HTTP client for the load harness: per-VU cookie jar, CSRF priming,
// bearer auth, request timing, timeout classification. Node 20+ (built-in fetch).

export const REQ_TIMEOUT_MS = Number(process.env.REQ_TIMEOUT_MS || 15000);

/** One virtual user's session: its own cookie jar + optional bearer token. */
export class Client {
  constructor(baseUrl) {
    this.base = baseUrl.replace(/\/+$/, '');
    this.cookies = new Map(); // name -> value (domain/path/secure ignored on purpose)
    this.token = null; // bearer access token
    this.csrf = null; // signed double-submit token
  }

  _cookieHeader() {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  _absorb(res) {
    // node-fetch exposes multiple Set-Cookie via getSetCookie()
    const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of raw) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  /**
   * Fire one request. Returns { status, ms, ok, bytes, json, timedOut, error, tag }.
   * `ok` = HTTP 2xx AND not a transport error/timeout.
   */
  async req(method, path, opts = {}) {
    const url = path.startsWith('http') ? path : this.base + path;
    const tag = opts.tag || `${method} ${path.split('?')[0]}`;
    const headers = { ...(opts.headers || {}) };
    let body;
    if (opts.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.json);
    }
    const cookie = this._cookieHeader();
    if (cookie) headers.cookie = cookie;
    if (opts.auth !== false && this.token) headers.authorization = `Bearer ${this.token}`;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && this.csrf && opts.csrf !== false) {
      headers['x-csrf-token'] = this.csrf;
    }

    const start = performance.now();
    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(opts.timeoutMs || REQ_TIMEOUT_MS),
      });
      this._absorb(res);
      const buf = await res.arrayBuffer(); // drain -> free socket, measure size
      const ms = performance.now() - start;
      let json = null;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json') && buf.byteLength) {
        try { json = JSON.parse(Buffer.from(buf).toString('utf8')); } catch { /* leave null */ }
      }
      return {
        tag, status: res.status, ms, bytes: buf.byteLength,
        ok: res.status >= 200 && res.status < 300,
        json, timedOut: false, error: null,
      };
    } catch (err) {
      const ms = performance.now() - start;
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      return { tag, status: 0, ms, bytes: 0, ok: false, json: null, timedOut, error: err?.code || err?.name || 'ERR' };
    }
  }

  get(path, opts) { return this.req('GET', path, opts); }
  post(path, opts) { return this.req('POST', path, opts); }
  patch(path, opts) { return this.req('PATCH', path, opts); }
  del(path, opts) { return this.req('DELETE', path, opts); }

  /** GET /api/csrf, store the csrfToken cookie + echo token for later writes.
   *  Tolerates 404 (the route only exists when CSRF is enabled). */
  async primeCsrf() {
    const r = await this.get('/api/csrf', { tag: 'GET /api/csrf' });
    this.csrf = r.json?.csrfToken || this.cookies.get('csrfToken') || null;
    return r;
  }

  /** POST /api/auth/login, store the access token. Returns the raw result.
   *  The API's login body is { identifier, password } (identifier = email or phone). */
  async login(identifier, password) {
    if (!this.csrf) await this.primeCsrf();
    const r = await this.post('/api/auth/login', { json: { identifier, password }, tag: 'POST /api/auth/login' });
    if (r.json?.accessToken) this.token = r.json.accessToken;
    return r;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** think-time: uniform [min,max] seconds */
export const think = (min, max) => sleep((min + Math.random() * (max - min)) * 1000);
