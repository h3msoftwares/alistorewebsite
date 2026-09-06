import { Request, Response } from 'express';
import * as service from './email-verification.service';
import { REGISTER_MESSAGE } from './auth.controller';

// Exported so the test suite asserts against the exact string.
export const VERIFY_EMAIL_MESSAGE = 'Your email has been verified. You can now sign in.';

export async function verifyEmailHandler(req: Request, res: Response) {
  const { token } = req.body as { token: string };
  await service.verifyEmail(token);
  res.status(200).json({ message: VERIFY_EMAIL_MESSAGE });
}

export async function resendVerificationHandler(req: Request, res: Response) {
  const { email, locale } = req.body as { email: string; locale: string };
  await service.resendVerification(email, locale);
  // Same generic message as register — the response is identical whether or
  // not the email resolves to an unverified account.
  res.status(200).json({ message: REGISTER_MESSAGE });
}
