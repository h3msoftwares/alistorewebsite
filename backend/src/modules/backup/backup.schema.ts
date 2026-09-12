import { z } from 'zod';

// Google Drive file ids aren't UUIDs — just an opaque alphanumeric string.
export const backupIdParamSchema = z.object({
  id: z.string().trim().min(1).max(200),
});
