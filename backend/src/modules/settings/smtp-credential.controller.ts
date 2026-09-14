import { Request, Response } from 'express';
import { recordAudit } from '../../lib/audit';
import * as smtpCredentialService from './smtp-credential.service';

export async function getSmtpStatusHandler(_req: Request, res: Response) {
  const status = await smtpCredentialService.getStatus();
  res.json({ status });
}

export async function setSmtpCredentialHandler(req: Request, res: Response) {
  const { email, appPassword } = req.body as { email: string; appPassword: string };

  const status = await smtpCredentialService.setCredential(email, appPassword, req.user!.id).catch(async (err: Error) => {
    // Never log the password itself — only that an attempt was made and for
    // which address, matching every other credential-adjacent audit row in
    // this codebase (backup.controller.ts's Drive connect/restore).
    await recordAudit({
      entityType: 'SmtpCredential',
      entityID: 'singleton',
      action: 'smtp_credential.set.failed',
      actorID: req.user!.id,
      metadata: { email, error: err.message },
    });
    throw err;
  });

  await recordAudit({
    entityType: 'SmtpCredential',
    entityID: 'singleton',
    action: 'smtp_credential.set',
    actorID: req.user!.id,
    metadata: { email },
  });

  res.json({ status });
}

export async function clearSmtpCredentialHandler(req: Request, res: Response) {
  const status = await smtpCredentialService.clearCredential(req.user!.id);

  await recordAudit({
    entityType: 'SmtpCredential',
    entityID: 'singleton',
    action: 'smtp_credential.clear',
    actorID: req.user!.id,
  });

  res.json({ status });
}
