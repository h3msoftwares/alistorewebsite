import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyCaptcha } from '../../src/lib/captcha';
import { env } from '../../src/config/env';

afterEach(() => vi.restoreAllMocks());

describe('hCaptcha HTTP verification boundary', () => {
  it('posts the token, configured secret and IP with a bounded timeout', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ success: true }));
    expect(await verifyCaptcha('valid-token', '127.0.0.1')).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.hcaptcha.com/siteverify');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({ secret: env.HCAPTCHA_SECRET, response: 'valid-token', remoteip: '127.0.0.1' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.signal?.aborted).toBe(false);
  });

  it('rejects an empty token without making an HTTP request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await verifyCaptcha('')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([false, undefined, 'true', 1])('requires boolean success=true, rejecting %s', async (success) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ success }));
    expect(await verifyCaptcha('token')).toBe(false);
  });

  it('fails closed on an unsuccessful HTTP response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));
    expect(await verifyCaptcha('token')).toBe(false);
  });

  it('fails closed on malformed JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not JSON'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await verifyCaptcha('token')).toBe(false);
  });

  it.each(['TimeoutError', 'TypeError'])('fails closed on %s from the HTTP request', async (name) => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('Siteverify unavailable', name));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await verifyCaptcha('token')).toBe(false);
  });
});
