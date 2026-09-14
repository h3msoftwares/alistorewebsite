import { z } from 'zod';
import { EMAIL_TEMPLATE_DEFS, type EmailTemplateKey } from '../../lib/email-templates';

const KEYS = Object.keys(EMAIL_TEMPLATE_DEFS) as [EmailTemplateKey, ...EmailTemplateKey[]];

export const emailTemplateKeySchema = z.enum(KEYS);

export const emailTemplateKeyParamSchema = z.object({
  key: emailTemplateKeySchema,
});

// Generous but bounded — an admin could plausibly paste a large HTML email,
// but 100 KB is already far past any legitimate transactional-email body.
// Every email is bilingual (see lib/mailer.ts's bilingualSubject/
// bilingualHtml), so an override must supply both languages at once — there
// is no such thing as a half-translated saved template.
export const updateEmailTemplateSchema = z.object({
  subjectEn: z.string().trim().min(1).max(300),
  subjectAr: z.string().trim().min(1).max(300),
  htmlBodyEn: z.string().trim().min(1).max(100_000),
  htmlBodyAr: z.string().trim().min(1).max(100_000),
});

export const sendTestEmailSchema = z.object({
  to: z.string().trim().email(),
});
