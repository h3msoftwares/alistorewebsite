import { Request, Response } from 'express';
import * as passwordResetService from './password-reset.service';

// Exported so the test suite can assert against the exact same string rather
// than a duplicated literal.
export const FORGOT_PASSWORD_MESSAGE =
  'If an account exists for this email, a reset link has been sent.';

export async function forgotPasswordHandler(req: Request, res: Response) {
  const { email, locale } = req.body as { email: string; locale: string };
  await passwordResetService.requestPasswordReset(email, locale);
  // Always this exact status + body, whether or not the email matched an
  // account — see password-reset.service.ts.
  res.status(200).json({ message: FORGOT_PASSWORD_MESSAGE });
}

export async function resetPasswordHandler(req: Request, res: Response) {
  const { token, newPassword } = req.body as { token: string; newPassword: string };
  await passwordResetService.resetPassword(token, newPassword);
  res.status(200).json({ message: 'Your password has been reset.' });
}
