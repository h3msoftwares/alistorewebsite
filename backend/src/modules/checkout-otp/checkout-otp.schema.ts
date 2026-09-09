import { z } from 'zod';

export const requestOtpSchema = z.object({
  email: z.string().email().max(320).toLowerCase(),
  // hCaptcha response tokens run ~2 KB; cap generously so an unbounded
  // string can't be forced through the verify call.
  captchaToken: z.string().min(1).max(5000),
});

export const verifyOtpSchema = z.object({
  email: z.string().email().max(320).toLowerCase(),
  code: z.string().length(6),
});
