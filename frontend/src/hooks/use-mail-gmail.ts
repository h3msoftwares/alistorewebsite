'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gmailMailApi } from '@/lib/api';
import { GMAIL_CONNECT_MESSAGE_SOURCE, type GmailConnectMessage } from '@/lib/gmail-connect-message';

const GMAIL_STATUS_KEY = ['mail', 'gmail', 'status'] as const;

export function useGmailStatus() {
  return useQuery({ queryKey: GMAIL_STATUS_KEY, queryFn: gmailMailApi.getGmailStatus });
}

/**
 * Runs the whole Gmail-send OAuth round-trip in a POPUP window instead of
 * navigating the admin's own tab away — same reasoning as use-backup.ts's
 * useConnectDrive (a full-tab navigation would wipe the in-memory access
 * token and force an unwanted session reload). `popup` must already be open
 * (via `window.open`) BEFORE this mutation starts, for the same popup-
 * blocker reason documented there.
 */
export function useConnectGmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (popup: Window | null) => {
      if (!popup) {
        throw new Error('Popup blocked — allow popups for this site and try again.');
      }
      return new Promise<'connected' | 'error' | 'cancelled'>((resolve, reject) => {
        let settled = false;
        const finish = (value: 'connected' | 'error' | 'cancelled') => {
          if (settled) return;
          settled = true;
          window.removeEventListener('message', onMessage);
          window.clearInterval(pollId);
          resolve(value);
        };

        function onMessage(e: MessageEvent<GmailConnectMessage>) {
          if (e.origin !== window.location.origin) return;
          if (e.data?.source !== GMAIL_CONNECT_MESSAGE_SOURCE) return;
          finish(e.data.result);
        }
        window.addEventListener('message', onMessage);

        const pollId = window.setInterval(() => {
          if (popup.closed) finish('cancelled');
        }, 500);

        gmailMailApi.getGmailConnectUrl().then(
          (url) => {
            popup.location.href = url;
          },
          (err) => {
            if (settled) return;
            settled = true;
            window.removeEventListener('message', onMessage);
            window.clearInterval(pollId);
            popup.close();
            reject(err);
          }
        );
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: GMAIL_STATUS_KEY }),
  });
}

export function useDisconnectGmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => gmailMailApi.disconnectGmail(),
    onSuccess: () => qc.invalidateQueries({ queryKey: GMAIL_STATUS_KEY }),
  });
}
