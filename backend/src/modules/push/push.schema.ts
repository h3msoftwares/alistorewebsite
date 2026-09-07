import { z } from 'zod';

export const saveSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const deleteSubscriptionSchema = z.object({
  endpoint: z.string().url(),
});
