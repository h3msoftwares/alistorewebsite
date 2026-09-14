'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { emailTemplatesApi } from '@/lib/api';
import type { EmailTemplateBody, EmailTemplateKey } from '@/lib/types';

const EMAIL_TEMPLATES_KEY = ['emailTemplates'] as const;

export function useEmailTemplates() {
  return useQuery({ queryKey: EMAIL_TEMPLATES_KEY, queryFn: emailTemplatesApi.listEmailTemplates });
}

export function useUpdateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, body }: { key: EmailTemplateKey; body: EmailTemplateBody }) =>
      emailTemplatesApi.updateEmailTemplate(key, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: EMAIL_TEMPLATES_KEY }),
  });
}

export function useResetEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: EmailTemplateKey) => emailTemplatesApi.resetEmailTemplate(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: EMAIL_TEMPLATES_KEY }),
  });
}

// No cache/invalidation — sending a test doesn't change any template state.
export function useSendTestEmail() {
  return useMutation({
    mutationFn: ({ key, to }: { key: EmailTemplateKey; to: string }) => emailTemplatesApi.sendTestEmail(key, to),
  });
}
