import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().optional(),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid(),
});
