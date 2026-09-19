'use client';

import { useParams } from 'next/navigation';
import { Cloud, CloudOff } from 'lucide-react';
import { Alert, Button, EmptyState, Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useGmailStatus, useConnectGmail, useDisconnectGmail } from '@/hooks/use-mail-gmail';

/**
 * Outgoing mail account — strictly ADMIN, unlike every other /admin page
 * which STAFF can reach via the granular permission system (see lib/rbac.tsx).
 * This is credentials-adjacent infrastructure, not a back-office task, so it
 * hard-checks `user.role` directly rather than going through `usePermissions`
 * — same pattern as /admin/backup. The backend (mail.routes.ts) enforces the
 * same rule independently; this is defense in depth, not the real gate.
 *
 * Its own page (not a card bolted onto /admin/backup) — the two share
 * nothing beyond both being ADMIN-only infrastructure; conflating them under
 * "Database backups" made this hard to find and read as unrelated to backups.
 */
export default function MailPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { user } = useAuth();

  if (user?.role !== 'ADMIN') {
    return (
      <div className="section--tight">
        <EmptyState
          tone="alert"
          title={t('Admins only', 'للمسؤولين فقط')}
          body={t(
            'The outgoing mail account is restricted to ADMIN accounts.',
            'حساب البريد الصادر مقتصر على حسابات المسؤول.'
          )}
        />
      </div>
    );
  }

  return <MailPanel locale={locale} />;
}

/**
 * The account outgoing mail (password reset, order confirmations, checkout
 * OTPs, etc.) is sent AS — the Gmail API is the only send path (see backend
 * modules/mail/gmail.client.ts): raw SMTP was removed entirely, since
 * Railway's free/hobby tier blocks outbound SMTP outright and could never
 * actually deliver mail in production.
 */
function MailPanel({ locale }: { locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Outgoing mail', 'البريد الصادر')}</h1>
      </div>

      <p className="prose" style={{ fontSize: 'var(--fs-sm)' }}>
        {t(
          'The account every outgoing email (password resets, order updates, checkout codes, and more) is sent from.',
          'الحساب الذي تُرسل منه كل رسائل البريد الإلكتروني الصادرة (إعادة تعيين كلمة المرور، تحديثات الطلبات، رموز الدفع، وغيرها).'
        )}
      </p>

      <GmailConnectionCard locale={locale} />
    </div>
  );
}

/**
 * Send outgoing mail via the Gmail API (see modules/mail/gmail.client.ts's
 * module doc): Railway's free/hobby tier blocks outbound SMTP entirely
 * (confirmed live), but the Gmail API is a plain HTTPS call, so it isn't
 * affected. Same popup-OAuth-round-trip pattern as the Backups page's
 * Google Drive card — "Connect" opens a popup so the admin's own
 * tab/session is never disturbed.
 */
function GmailConnectionCard({ locale }: { locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { data: status, isPending } = useGmailStatus();
  const connect = useConnectGmail();
  const disconnect = useDisconnectGmail();

  const busy = connect.isPending || disconnect.isPending;

  function handleConnect() {
    // Opened synchronously, in direct response to the click — see
    // useConnectGmail's doc comment for why this can't happen after an await.
    const popup = window.open('about:blank', 'h3m-gmail-connect', 'width=520,height=680');
    connect.mutate(popup);
  }

  return (
    <div className="list-item">
      <div className={`stat-icon ${status?.connectedEmail ? 'is-success' : 'is-warning'}`}>
        <Icon as={status?.connectedEmail ? Cloud : CloudOff} size={20} />
      </div>
      <div className="list-item-body">
        <h3 className="list-item-title">{t('Send via Gmail', 'الإرسال عبر Gmail')}</h3>

        {connect.isSuccess && connect.data === 'connected' && (
          <Alert tone="success">{t('Gmail connected.', 'تم الاتصال بـ Gmail.')}</Alert>
        )}
        {(connect.isError || connect.data === 'error') && (
          <Alert tone="danger">{t('Could not connect Gmail. Try again.', 'تعذّر الاتصال بـ Gmail. حاول مجددًا.')}</Alert>
        )}
        {disconnect.isError && (
          <Alert tone="danger">{t('Could not disconnect. Try again.', 'تعذّر قطع الاتصال. حاول مجددًا.')}</Alert>
        )}

        {!isPending && (
          <p className="text-sm text-secondary" style={{ marginTop: 'var(--space-1)' }}>
            {status?.connectedEmail
              ? t(`Sending as ${status.connectedEmail}.`, `يُرسل باسم ${status.connectedEmail}.`)
              : t('Not connected — outgoing emails cannot be sent.', 'غير متصل — لا يمكن إرسال رسائل البريد الإلكتروني الصادرة.')}
          </p>
        )}

        <div style={{ marginTop: 'var(--space-3)' }}>
          {status?.connectedEmail ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => disconnect.mutate()}
              loading={disconnect.isPending}
              disabled={busy}
            >
              {t('Disconnect', 'قطع الاتصال')}
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={handleConnect} loading={connect.isPending} disabled={busy}>
              {t('Connect Gmail account', 'ربط حساب Gmail')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
