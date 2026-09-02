import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(6).optional(),
  password: z.string().min(8),
}).refine((data) => data.email || data.phone, {
  message: 'Either email or phone is required',
});

export const loginSchema = z.object({
  identifier: z.string().min(1), // email or phone
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
