import { z } from 'zod';

/**
 * Change password for a signed-in user. The current password is required and
 * verified server-side (see auth.service.changePassword) — this is not a
 * reset, so possession of a valid session is not enough on its own.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    // Same floor as registerSchema / resetPasswordSchema — it's the same
    // credential being replaced.
    newPassword: z.string().min(8).max(200),
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current password',
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
