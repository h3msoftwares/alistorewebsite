'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { GMAIL_CONNECT_MESSAGE_SOURCE, type GmailConnectMessage } from '@/lib/gmail-connect-message';

/**
 * Runs ONLY inside the popup window `useConnectGmail` (admin/mail/page.tsx)
 * opens for the Gmail-send OAuth round-trip — never in the admin's own main
 * tab. Deliberately outside the /admin subtree so it skips AdminLayout's
 * auth bootstrap/role redirect entirely — mirrors drive-connect-result's
 * page exactly, just for the Gmail-send flow instead of Drive.
 */
export default function GmailConnectResultPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const [result] = useState<'connected' | 'error' | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URL(window.location.href).searchParams.get('result') === 'connected'
        ? 'connected'
        : 'error'
  );

  useEffect(() => {
    if (!result) return;
    if (window.opener) {
      const message: GmailConnectMessage = { source: GMAIL_CONNECT_MESSAGE_SOURCE, result };
      window.opener.postMessage(message, window.location.origin);
    }
    const id = window.setTimeout(() => window.close(), 300);
    return () => window.clearTimeout(id);
  }, [result]);

  return (
    <div className="section" style={{ maxWidth: '22rem', marginInline: 'auto', textAlign: 'center' }}>
      <p className="prose">
        {result === 'connected'
          ? t('Gmail connected. You can close this window.', 'تم الاتصال بـ Gmail. يمكنك إغلاق هذه النافذة.')
          : result === 'error'
            ? t('Could not connect Gmail. You can close this window.', 'تعذّر الاتصال بـ Gmail. يمكنك إغلاق هذه النافذة.')
            : t('Finishing up…', 'جارٍ الإنهاء…')}
      </p>
    </div>
  );
}
