import { z } from 'zod';

// Shared body shapes for the image sub-resources of Collection / Category /
// Product. All three image tables have an identical shape (see prisma schema).
export const createImageSchema = z.object({
  url: z.string().url(),
  // ImageKit's file id for this asset (from the upload response) — lets the
  // delete endpoint remove the underlying file, not just this row. Optional:
  // a caller without one (or a pre-migration client) just won't get that
  // cleanup for this image.
  fileId: z.string().optional(),
  altEn: z.string().max(300).optional(),
  altAr: z.string().max(300).optional(),
  sortOrder: z.number().int().nonnegative().default(0),
});

export const updateImageSchema = createImageSchema.partial();

export type CreateImageInput = z.infer<typeof createImageSchema>;
export type UpdateImageInput = z.infer<typeof updateImageSchema>;
