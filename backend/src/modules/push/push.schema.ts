import { z } from 'zod';

// A push endpoint URL runs ~200 chars for the big providers; the keys are
// short base64. Cap both so an unbounded string can't be stored.
const pushEndpoint = z.string().url().max(1000);

export const saveSubscriptionSchema = z.object({
  endpoint: pushEndpoint,
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

export const deleteSubscriptionSchema = z.object({
  endpoint: pushEndpoint,
});
