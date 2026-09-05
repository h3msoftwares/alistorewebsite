import { describe, it, expect, vi, afterEach } from 'vitest';
import { deleteImageKitFile } from '../../src/modules/uploads/upload.service';

describe('deleteImageKitFile', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("calls ImageKit's delete-file API with Basic Auth from the private key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await deleteImageKitFile('file_abc123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.imagekit.io/v1/files/file_abc123');
    expect(init.method).toBe('DELETE');
    // vitest.config.mts sets IMAGEKIT_PRIVATE_KEY to this fixed test value.
    const expectedAuth = `Basic ${Buffer.from('test-imagekit-private-key-0123456789:').toString('base64')}`;
    expect(init.headers.Authorization).toBe(expectedAuth);
  });

  it('treats a 404 (already deleted) as success, not an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'not found' });
    global.fetch = fetchMock as unknown as typeof fetch;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(deleteImageKitFile('gone')).resolves.toBeUndefined();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('logs but does not throw on a non-404 failure response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    global.fetch = fetchMock as unknown as typeof fetch;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(deleteImageKitFile('file_x')).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledTimes(1);
  });

  it('logs but does not throw when fetch itself rejects (network error)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(deleteImageKitFile('file_y')).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledTimes(1);
  });
});
