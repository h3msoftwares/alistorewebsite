import type { Request, Response } from 'express';
import * as emailTemplates from './email-templates.service';
import type { EmailTemplateKey } from '../../lib/email-templates';

export async function listEmailTemplatesHandler(_req: Request, res: Response) {
  res.json({ templates: await emailTemplates.listEmailTemplates() });
}

export async function getEmailTemplateHandler(req: Request, res: Response) {
  const key = req.params.key as EmailTemplateKey;
  res.json({ template: await emailTemplates.getEmailTemplate(key) });
}

export async function updateEmailTemplateHandler(req: Request, res: Response) {
  const key = req.params.key as EmailTemplateKey;
  const template = await emailTemplates.updateEmailTemplate(key, req.body, req.user?.id);
  res.json({ template });
}

export async function resetEmailTemplateHandler(req: Request, res: Response) {
  const key = req.params.key as EmailTemplateKey;
  const template = await emailTemplates.resetEmailTemplate(key, req.user?.id);
  res.json({ template });
}

export async function sendTestEmailHandler(req: Request, res: Response) {
  const key = req.params.key as EmailTemplateKey;
  await emailTemplates.sendTestEmail(key, req.body.to);
  res.status(204).send();
}
