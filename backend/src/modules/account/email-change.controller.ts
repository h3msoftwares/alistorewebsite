import { Request, Response } from 'express';
import { recordAudit } from '../../lib/audit';
import * as service from './email-change.service';

// Exported so the test suite asserts against the exact string. Deliberately
// generic/identical whether or not `newEmail` was actually free to claim —
// see the enumeration-resistance note on requestEmailChange.
export const REQUEST_MESSAGE = 'If that email is available, a confirmation link has been sent to it.';
export const CONFIRM_MESSAGE = 'Your account email has been changed. Please sign in again.';

export async function requestEmailChangeHandler(req: Request, res: Response) {
  const { newEmail, currentPassword, locale } = req.body as {
    newEmail: string;
    currentPassword: string;
    locale: string;
  };

  await service.requestEmailChange(req.user!.id, newEmail, currentPassword, locale).catch(async (err: Error) => {
    await recordAudit({
      entityType: 'User',
      entityID: req.user!.id,
      action: 'email_change.request.failed',
      actorID: req.user!.id,
      metadata: { newEmail, error: err.message },
    });
    throw err;
  });

  await recordAudit({
    entityType: 'User',
    entityID: req.user!.id,
    action: 'email_change.request',
    actorID: req.user!.id,
    metadata: { newEmail },
  });

  res.status(200).json({ message: REQUEST_MESSAGE });
}

export async function confirmEmailChangeHandler(req: Request, res: Response) {
  const { token } = req.body as { token: string };
  await service.confirmEmailChange(token);
  res.status(200).json({ message: CONFIRM_MESSAGE });
}
