import { uploadsApi } from './api';

const UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';

export interface UploadedImage {
  url: string;
  fileId: string;
}

export interface UploadImageOptions {
  /** ImageKit folder to file the upload under, e.g. "/products". */
  folder?: string;
  /** Defaults to the File's own name. */
  fileName?: string;
}

/**
 * Uploads a file straight from the browser to ImageKit, authorized by a
 * fresh signed token from our own server (`GET /api/uploads/imagekit-auth`,
 * admin-only — see lib/api/uploads.ts) — the file itself never passes
 * through our backend, only the resulting URL does (saved via the
 * collection/category/product image sub-resource endpoints). Throws with a
 * readable message on any failure: not signed in as an admin, network
 * error, or ImageKit-side rejection (bad file type, over the size limit).
 */
export async function uploadImage(file: File, opts: UploadImageOptions = {}): Promise<UploadedImage> {
  const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error('Image uploads are not configured (NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY is unset).');
  }

  const { token, expire, signature } = await uploadsApi.getImageKitAuth();

  const form = new FormData();
  form.append('file', file);
  form.append('fileName', opts.fileName ?? file.name);
  form.append('publicKey', publicKey);
  form.append('signature', signature);
  form.append('expire', String(expire));
  form.append('token', token);
  form.append('useUniqueFileName', 'true');
  if (opts.folder) form.append('folder', opts.folder);

  const res = await fetch(UPLOAD_URL, { method: 'POST', body: form });
  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : `Upload failed (${res.status})`;
    throw new Error(message);
  }

  const body = data as { url?: string; fileId?: string };
  if (!body.url || !body.fileId) throw new Error('Upload succeeded but ImageKit returned no file URL.');
  return { url: body.url, fileId: body.fileId };
}
