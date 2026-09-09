import { z } from 'zod';
import { httpUrl } from '../../lib/safe-url';

// Shared body shapes for the image sub-resources of Collection / Category /
// Product. All three image tables have an identical shape (see prisma schema).
export const createImageSchema = z.object({
  // http(s) only — never a `javascript:` / `data:` scheme, in case a URL here
  // ever reaches an `<a href>` rather than an `<img src>`.
  url: httpUrl,
  // ImageKit's file id for this asset (from the upload response) — lets the
  // delete endpoint remove the underlying file, not just this row. Optional:
  // a caller without one (or a pre-migration client) just won't get that
  // cleanup for this image.
  fileId: z.string().max(200).optional(),
  altEn: z.string().trim().max(300).optional(),
  altAr: z.string().trim().max(300).optional(),
  sortOrder: z.number().int().nonnegative().default(0),
});

export const updateImageSchema = createImageSchema.partial();

export type CreateImageInput = z.infer<typeof createImageSchema>;
export type UpdateImageInput = z.infer<typeof updateImageSchema>;
