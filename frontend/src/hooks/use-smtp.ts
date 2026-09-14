'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { smtpApi } from '@/lib/api';
import type { SetSmtpCredentialBody } from '@/lib/types';

const SMTP_STATUS_KEY = ['smtp', 'status'] as const;

export function useSmtpStatus() {
  return useQuery({ queryKey: SMTP_STATUS_KEY, queryFn: smtpApi.getSmtpStatus });
}

/** Verified server-side with a real SMTP handshake before being saved — a
 *  wrong app password rejects with a 400, nothing is persisted. */
export function useSetSmtpCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetSmtpCredentialBody) => smtpApi.setSmtpCredential(body),
    onSuccess: (status) => qc.setQueryData(SMTP_STATUS_KEY, status),
  });
}

/** Reverts to the SMTP_* environment fallback (if any). */
export function useClearSmtpCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => smtpApi.clearSmtpCredential(),
    onSuccess: (status) => qc.setQueryData(SMTP_STATUS_KEY, status),
  });
}
