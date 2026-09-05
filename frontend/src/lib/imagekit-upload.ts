import { uploadsApi } from './api';

const UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // generous for product photography, well under ImageKit's own cap

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
 * Rejects anything that isn't a real, reasonably-sized image before it ever
 * reaches the network — the `accept="image/*"` picker hint on the file
 * input only narrows the OS dialog, it doesn't stop a drag-drop or a
 * renamed file, and `file.type` itself comes from the extension, not the
 * bytes. Sniffing the first few bytes for each format's magic number catches
 * a mislabelled or corrupted file that a MIME-type check alone would miss.
 */
async function assertLooksLikeAnImage(file: File): Promise<void> {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error(`Unsupported file type "${file.type || 'unknown'}" — please upload a JPEG, PNG, WebP, GIF, or AVIF image.`);
  }
  if (file.size === 0) {
    throw new Error('That file is empty.');
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`Image is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB) — the maximum is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`);
  }

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const matches = (bytes: number[], offset = 0) => bytes.every((b, i) => header[offset + i] === b);
  const isJpeg = matches([0xff, 0xd8, 0xff]);
  const isPng = matches([0x89, 0x50, 0x4e, 0x47]);
  const isGif = matches([0x47, 0x49, 0x46, 0x38]);
  const isWebp = matches([0x52, 0x49, 0x46, 0x46]) && matches([0x57, 0x45, 0x42, 0x50], 8);
  const isAvif =
    matches([0x66, 0x74, 0x79, 0x70], 4) && (matches([0x61, 0x76, 0x69, 0x66], 8) || matches([0x61, 0x76, 0x69, 0x73], 8));
  if (!isJpeg && !isPng && !isGif && !isWebp && !isAvif) {
    throw new Error("That file doesn't look like a valid image — it may be corrupted or renamed.");
  }
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
  await assertLooksLikeAnImage(file);

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
