import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { recordAudit } from '../../lib/audit';
import {
  EMAIL_TEMPLATE_DEFS,
  SAMPLE_VARS_EN,
  SAMPLE_VARS_AR,
  interpolate,
  referencedVariables,
  type EmailTemplateKey,
} from '../../lib/email-templates';
import { esc, bilingualSubject, bilingualHtml, getTransporter } from '../../lib/mailer';

export interface EmailTemplateSummary {
  key: EmailTemplateKey;
  label: string;
  trigger: string;
  variables: string[];
  subjectEn: string;
  subjectAr: string;
  htmlBodyEn: string;
  htmlBodyAr: string;
  /** True once an admin has overridden this key — false means it's still
   *  showing the coded default. */
  isCustomized: boolean;
  updatedAt: string | null;
}

function toSummary(
  key: EmailTemplateKey,
  row: { subjectEn: string; subjectAr: string; htmlBodyEn: string; htmlBodyAr: string; updatedAt: Date } | null
): EmailTemplateSummary {
  const def = EMAIL_TEMPLATE_DEFS[key];
  return {
    key,
    label: def.label,
    trigger: def.trigger,
    variables: def.variables,
    subjectEn: row?.subjectEn ?? def.defaultSubjectEn,
    subjectAr: row?.subjectAr ?? def.defaultSubjectAr,
    htmlBodyEn: row?.htmlBodyEn ?? def.defaultBodyEn,
    htmlBodyAr: row?.htmlBodyAr ?? def.defaultBodyAr,
    isCustomized: row !== null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

export async function listEmailTemplates(): Promise<EmailTemplateSummary[]> {
  const rows = await prisma.emailTemplate.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return (Object.keys(EMAIL_TEMPLATE_DEFS) as EmailTemplateKey[]).map((key) =>
    toSummary(key, byKey.get(key) ?? null)
  );
}

export async function getEmailTemplate(key: EmailTemplateKey): Promise<EmailTemplateSummary> {
  const row = await prisma.emailTemplate.findUnique({ where: { key } });
  return toSummary(key, row);
}

// A typo'd {{varaint}} would otherwise ship to customers as literal,
// unreplaced text — reject it at save time instead, against exactly the
// variables that key's actual send call supplies (see lib/email-templates.ts).
// Checked across all four fields — the allowlist is shared by both languages.
function assertKnownVariables(key: EmailTemplateKey, subjectEn: string, subjectAr: string, htmlBodyEn: string, htmlBodyAr: string) {
  const allowed = new Set(EMAIL_TEMPLATE_DEFS[key].variables);
  const used = new Set([
    ...referencedVariables(subjectEn),
    ...referencedVariables(subjectAr),
    ...referencedVariables(htmlBodyEn),
    ...referencedVariables(htmlBodyAr),
  ]);
  const unknown = [...used].filter((name) => !allowed.has(name));
  if (unknown.length) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Unknown placeholder(s): ${unknown.map((n) => `{{${n}}}`).join(', ')}. Available: ${[...allowed].map((n) => `{{${n}}}`).join(', ')}`
    );
  }
}

export async function updateEmailTemplate(
  key: EmailTemplateKey,
  input: { subjectEn: string; subjectAr: string; htmlBodyEn: string; htmlBodyAr: string },
  actorId?: string
): Promise<EmailTemplateSummary> {
  assertKnownVariables(key, input.subjectEn, input.subjectAr, input.htmlBodyEn, input.htmlBodyAr);
  const row = await prisma.emailTemplate.upsert({
    where: { key },
    update: input,
    create: { key, ...input },
  });
  void recordAudit({ entityType: 'emailTemplate', entityID: key, action: 'emailTemplate.updated', actorID: actorId });
  return toSummary(key, row);
}

export async function resetEmailTemplate(key: EmailTemplateKey, actorId?: string): Promise<EmailTemplateSummary> {
  await prisma.emailTemplate.deleteMany({ where: { key } });
  void recordAudit({ entityType: 'emailTemplate', entityID: key, action: 'emailTemplate.reset', actorID: actorId });
  return toSummary(key, null);
}

/** Renders with the sample vars and sends a real bilingual message through
 *  the exact same transporter/from-address logic every real send uses
 *  (getTransporter() — the admin-configured SMTP account when one exists,
 *  else the SMTP_* env fallback), so a successful test genuinely proves the
 *  live configuration works. */
export async function sendTestEmail(key: EmailTemplateKey, to: string): Promise<void> {
  const conn = await getTransporter();
  if (!conn) {
    throw new AppError('CONFLICT', 'SMTP is not configured in this environment — nothing was sent.');
  }
  const { transporter, from } = conn;

  const def = EMAIL_TEMPLATE_DEFS[key];
  const row = await prisma.emailTemplate.findUnique({ where: { key } });
  const subjectEnTpl = row?.subjectEn ?? def.defaultSubjectEn;
  const subjectArTpl = row?.subjectAr ?? def.defaultSubjectAr;
  const bodyEnTpl = row?.htmlBodyEn ?? def.defaultBodyEn;
  const bodyArTpl = row?.htmlBodyAr ?? def.defaultBodyAr;

  const banner = (label: string) =>
    `<p style="background:#fef3cd;border:1px solid #f0c14b;padding:8px 12px;font:13px sans-serif;">` +
    `This is a test send of the <strong>${esc(label)}</strong> template, with sample data.</p>`;

  const subject = bilingualSubject(
    `[Test] ${interpolate(subjectEnTpl, SAMPLE_VARS_EN[key])}`,
    `[تجربة] ${interpolate(subjectArTpl, SAMPLE_VARS_AR[key])}`
  );
  const html = bilingualHtml(
    banner(def.label) + interpolate(bodyEnTpl, SAMPLE_VARS_EN[key]),
    interpolate(bodyArTpl, SAMPLE_VARS_AR[key])
  );

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text: `Test send of "${def.label}" — view in an HTML-capable mail client.`,
    });
  } catch (err) {
    throw new AppError('CONFLICT', `Could not send the test email: ${err instanceof Error ? err.message : String(err)}`);
  }
}
