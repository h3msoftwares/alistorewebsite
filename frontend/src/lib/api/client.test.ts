import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, apiRequest, API_URL } from './client';
import { ApiError } from './errors';
import { getAccessToken, setAccessToken } from './token';

interface FakeInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function res(status: number, body: unknown) {
  const text = typeof body === 'string' ? body : body === undefined ? '' : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => body,
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setAccessToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe('api client', () => {
  it('builds the URL and drops undefined / empty query params', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { ok: 1 }));
    await api.get('/api/products', { query: { a: 1, b: undefined, c: '', d: 'z', e: false } });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/api/products?a=1&d=z&e=false`);
  });

  it('attaches the bearer token when one is set', async () => {
    setAccessToken('tok-123');
    fetchMock.mockResolvedValueOnce(res(200, {}));
    await api.get('/api/users/me');
    const init = fetchMock.mock.calls[0][1] as FakeInit;
    expect(init.headers?.Authorization).toBe('Bearer tok-123');
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe('include');
  });

  it('omits the token when auth:false even if one is set', async () => {
    setAccessToken('tok-123');
    fetchMock.mockResolvedValueOnce(res(200, {}));
    await api.get('/api/collections', { auth: false });
    const init = fetchMock.mock.calls[0][1] as FakeInit;
    expect(init.headers?.Authorization).toBeUndefined();
  });

  it('serializes a JSON body and sets the content-type', async () => {
    fetchMock.mockResolvedValueOnce(res(201, { id: 1 }));
    await api.post('/api/addresses', { city: 'Amman' });
    const init = fetchMock.mock.calls[0][1] as FakeInit;
    expect(init.method).toBe('POST');
    expect(init.headers?.['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ city: 'Amman' });
  });

  it('returns undefined for a 204', async () => {
    fetchMock.mockResolvedValueOnce(res(204, undefined));
    await expect(api.del('/api/cart/items/x')).resolves.toBeUndefined();
  });

  it('throws a typed ApiError from the backend error envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      res(409, { error: { code: 'CONFLICT', message: 'slug taken', meta: { field: 'slug' } } })
    );
    await expect(api.post('/api/collections', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      code: 'CONFLICT',
      message: 'slug taken',
      meta: { field: 'slug' },
    });
  });

  it('exposes zod issues on a VALIDATION_ERROR', async () => {
    fetchMock.mockResolvedValueOnce(
      res(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'bad',
          meta: { issues: [{ path: 'slug', message: 'required' }] },
        },
      })
    );
    try {
      await api.post('/api/collections', {});
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).issues).toEqual([{ path: 'slug', message: 'required' }]);
    }
  });

  it('on 401 it refreshes once and replays the original request', async () => {
    setAccessToken('stale');
    fetchMock
      .mockResolvedValueOnce(res(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(res(200, { accessToken: 'fresh' })) // POST /api/auth/refresh
      .mockResolvedValueOnce(res(200, { orders: [] })); // replay

    const out = await apiRequest('GET', '/api/orders/mine');
    expect(out).toEqual({ orders: [] });
    expect(getAccessToken()).toBe('fresh');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_URL}/api/auth/refresh`);
    // replayed request carries the new token
    const replayInit = fetchMock.mock.calls[2][1] as FakeInit;
    expect(replayInit.headers?.Authorization).toBe('Bearer fresh');
  });

  it('when the refresh fails it clears the token and surfaces the 401', async () => {
    setAccessToken('stale');
    fetchMock
      .mockResolvedValueOnce(res(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(res(401, { error: { code: 'UNAUTHORIZED', message: 'no session' } }));

    await expect(apiRequest('GET', '/api/orders/mine')).rejects.toMatchObject({ status: 401 });
    expect(getAccessToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not attempt a refresh loop for /api/auth/* paths', async () => {
    fetchMock.mockResolvedValueOnce(res(401, { error: { code: 'UNAUTHORIZED', message: 'bad' } }));
    await expect(apiRequest('POST', '/api/auth/login', { auth: false })).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
