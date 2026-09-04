import { api } from './client';

export interface ImageKitAuthParams {
  token: string;
  expire: number;
  signature: string;
}

/** Admin-only — a fresh, single-use signed token from our own server (never
 *  the ImageKit private key itself). See lib/imagekit-upload.ts for what
 *  it's used for. */
export function getImageKitAuth() {
  return api.get<ImageKitAuthParams>('/api/uploads/imagekit-auth');
}
