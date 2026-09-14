import { api } from './client';
import type { EmailTemplate, EmailTemplateBody, EmailTemplateKey } from '../types';

export function listEmailTemplates() {
  return api.get<{ templates: EmailTemplate[] }>('/api/admin/email-templates').then((r) => r.templates);
}

export function updateEmailTemplate(key: EmailTemplateKey, body: EmailTemplateBody) {
  return api
    .put<{ template: EmailTemplate }>(`/api/admin/email-templates/${key}`, body)
    .then((r) => r.template);
}

export function resetEmailTemplate(key: EmailTemplateKey) {
  return api
    .post<{ template: EmailTemplate }>(`/api/admin/email-templates/${key}/reset`, {})
    .then((r) => r.template);
}

export function sendTestEmail(key: EmailTemplateKey, to: string) {
  return api.post(`/api/admin/email-templates/${key}/test`, { to });
}
