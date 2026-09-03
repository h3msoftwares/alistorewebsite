import { z } from 'zod';

// Shared body shapes for the image sub-resources of Collection / Category /
// Product. All three image tables have an identical shape (see prisma schema).
export const createImageSchema = z.object({
  url: z.string().url(),
  altEn: z.string().max(300).optional(),
  altAr: z.string().max(300).optional(),
  sortOrder: z.number().int().nonnegative().default(0),
});

export const updateImageSchema = createImageSchema.partial();

export type CreateImageInput = z.infer<typeof createImageSchema>;
export type UpdateImageInput = z.infer<typeof updateImageSchema>;
