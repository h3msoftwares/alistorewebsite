import { z } from 'zod';

export const requestOtpSchema = z.object({
  email: z.string().email().toLowerCase(),
  captchaToken: z.string().min(1),
});

export const verifyOtpSchema = z.object({
  email: z.string().email().toLowerCase(),
  code: z.string().length(6),
});
