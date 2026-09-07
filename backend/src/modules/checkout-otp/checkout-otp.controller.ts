import { Request, Response } from 'express';
import * as checkoutOtpService from './checkout-otp.service';

export async function requestOtpHandler(req: Request, res: Response) {
  const { email, captchaToken } = req.body as { email: string; captchaToken: string };
  await checkoutOtpService.requestOtp(email, captchaToken, req.ip);
  res.status(204).end();
}

export async function verifyOtpHandler(req: Request, res: Response) {
  const { email, code } = req.body as { email: string; code: string };
  const result = await checkoutOtpService.verifyOtp(email, code, req.user?.id);
  res.json(result);
}
