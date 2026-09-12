import { z } from 'zod';
import { BACKUP_FREQUENCIES } from './schedule';

// Google Drive file ids aren't UUIDs — just an opaque alphanumeric string.
export const backupIdParamSchema = z.object({
  id: z.string().trim().min(1).max(200),
});

export const updateBackupSettingsSchema = z.object({
  frequency: z.enum(BACKUP_FREQUENCIES),
});
