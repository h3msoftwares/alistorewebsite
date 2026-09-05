import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./api', () => ({
  uploadsApi: { getImageKitAuth: vi.fn() },
}));

import { uploadsApi } from './api';
import { uploadImage } from './imagekit-upload';

function makeFile(bytes: number[], type: string, name = 'photo'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
const GIF_HEADER = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0];
const WEBP_HEADER = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const AVIF_HEADER = [0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66];
const NOT_AN_IMAGE = [0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0]; // a zip's magic bytes

describe('uploadImage', () => {
  const originalFetch = global.fetch;
  const originalPublicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY = 'test-public-key';
    vi.mocked(uploadsApi.getImageKitAuth).mockResolvedValue({ token: 'tok', expire: 123, signature: 'sig' });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY = originalPublicKey;
  });

  it('rejects a file whose declared MIME type is not an allowed image type', async () => {
    const file = makeFile(NOT_AN_IMAGE, 'application/zip');
    await expect(uploadImage(file)).rejects.toThrow(/unsupported file type/i);
    expect(uploadsApi.getImageKitAuth).not.toHaveBeenCalled();
  });

  it('rejects an empty file', async () => {
    const file = makeFile([], 'image/png');
    await expect(uploadImage(file)).rejects.toThrow(/empty/i);
  });

  it('rejects a file over the size limit', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(PNG_HEADER);
    const file = new File([big], 'huge.png', { type: 'image/png' });
    await expect(uploadImage(file)).rejects.toThrow(/too large/i);
  });

  it("rejects a file whose bytes don't match its declared image type (renamed/corrupted)", async () => {
    const file = makeFile(NOT_AN_IMAGE, 'image/png');
    await expect(uploadImage(file)).rejects.toThrow(/doesn't look like a valid image/i);
  });

  it.each([
    ['image/png', PNG_HEADER],
    ['image/jpeg', JPEG_HEADER],
    ['image/gif', GIF_HEADER],
    ['image/webp', WEBP_HEADER],
    ['image/avif', AVIF_HEADER],
  ])('accepts a real %s file and uploads it', async (type, header) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://ik.imagekit.io/demo/x.jpg', fileId: 'file_1' }),
    }) as unknown as typeof fetch;

    const file = makeFile(header, type);
    const result = await uploadImage(file);
    expect(result).toEqual({ url: 'https://ik.imagekit.io/demo/x.jpg', fileId: 'file_1' });
  });

  it('surfaces the message ImageKit returns on a rejected upload', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Your file is corrupt.' }),
    }) as unknown as typeof fetch;

    const file = makeFile(PNG_HEADER, 'image/png');
    await expect(uploadImage(file)).rejects.toThrow('Your file is corrupt.');
  });

  it('throws if ImageKit reports success but omits the url/fileId', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;

    const file = makeFile(PNG_HEADER, 'image/png');
    await expect(uploadImage(file)).rejects.toThrow(/no file url/i);
  });

  it('throws a clear error when the public key is not configured', async () => {
    delete process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
    const file = makeFile(PNG_HEADER, 'image/png');
    await expect(uploadImage(file)).rejects.toThrow(/not configured/i);
  });
});
