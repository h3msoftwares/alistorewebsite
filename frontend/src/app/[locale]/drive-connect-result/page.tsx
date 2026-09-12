'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { DRIVE_CONNECT_MESSAGE_SOURCE, type DriveConnectMessage } from '@/lib/drive-connect-message';

/**
 * Runs ONLY inside the popup window `useConnectDrive` (admin/backup/page.tsx)
 * opens for the Google Drive OAuth round-trip — never in the admin's own
 * main tab. Deliberately outside the /admin subtree so it skips
 * AdminLayout's auth bootstrap/role redirect entirely: this page carries no
 * sensitive data, its only job is telling the opener how the connection
 * attempt went and then getting out of the way.
 */
export default function DriveConnectResultPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  // Lazy initializer — reads the query param once, synchronously, at mount
  // rather than via an effect + setState (which would cost an extra render
  // for a value that's already known up front).
  const [result] = useState<'connected' | 'error' | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URL(window.location.href).searchParams.get('result') === 'connected'
        ? 'connected'
        : 'error'
  );

  // The side effects (postMessage + close) still belong in an effect — they
  // touch the outside world, not React state.
  useEffect(() => {
    if (!result) return;
    if (window.opener) {
      const message: DriveConnectMessage = { source: DRIVE_CONNECT_MESSAGE_SOURCE, result };
      window.opener.postMessage(message, window.location.origin);
    }
    // Only script-opened windows can close themselves — true here, this page
    // only ever exists as the target of useConnectDrive's window.open(). A
    // direct visit (no opener) just falls through to the static message below.
    const id = window.setTimeout(() => window.close(), 300);
    return () => window.clearTimeout(id);
  }, [result]);

  return (
    <div className="section" style={{ maxWidth: '22rem', marginInline: 'auto', textAlign: 'center' }}>
      <p className="prose">
        {result === 'connected'
          ? t('Google Drive connected. You can close this window.', 'تم الاتصال بـ Google Drive. يمكنك إغلاق هذه النافذة.')
          : result === 'error'
            ? t('Could not connect Google Drive. You can close this window.', 'تعذّر الاتصال بـ Google Drive. يمكنك إغلاق هذه النافذة.')
            : t('Finishing up…', 'جارٍ الإنهاء…')}
      </p>
    </div>
  );
}
