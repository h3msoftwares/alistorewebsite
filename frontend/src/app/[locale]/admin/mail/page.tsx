'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Mail, MailWarning } from 'lucide-react';
import { Alert, Button, EmptyState, Field, Icon, Input, Modal } from '@/components/ui';
import { useAuth, useStepUp } from '@/hooks/use-auth';
import { useSmtpStatus, useSetSmtpCredential, useClearSmtpCredential } from '@/hooks/use-smtp';
import { isApiError } from '@/lib/api';

/**
 * Outgoing mail account — strictly ADMIN, unlike every other /admin page
 * which STAFF can reach via the granular permission system (see lib/rbac.tsx).
 * This is credentials-adjacent infrastructure, not a back-office task, so it
 * hard-checks `user.role` directly rather than going through `usePermissions`
 * — same pattern as /admin/backup. The backend (smtp-credential.routes.ts)
 * enforces the same rule independently; this is defense in depth, not the
 * real gate.
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
 * OTPs, etc.) is sent AS — a Gmail address + app password (see backend
 * modules/settings/smtp-credential.service.ts). Falls back to the server's
 * SMTP_* environment variables until an admin sets one here; once set, the
 * DB row takes priority. The app password itself is never returned by the
 * API (write-only) — only whether something is configured, and which
 * address it sends as.
 */
function MailPanel({ locale }: { locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { data: status, isPending } = useSmtpStatus();
  const clear = useClearSmtpCredential();
  const [editing, setEditing] = useState(false);

  const configured = status?.configured ?? false;

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

      <div className="list-item">
        <div className={`stat-icon ${configured ? 'is-success' : 'is-warning'}`}>
          <Icon as={configured ? Mail : MailWarning} size={20} />
        </div>
        <div className="list-item-body">
          <h3 className="list-item-title">{t('Outgoing mail account', 'حساب البريد الصادر')}</h3>

          {clear.isSuccess && (
            <Alert tone="success">
              {t('Reverted to the server default.', 'تمت العودة إلى الإعداد الافتراضي للخادم.')}
            </Alert>
          )}
          {clear.isError && (
            <Alert tone="danger">{t('Could not clear the account. Try again.', 'تعذّر مسح الحساب. حاول مجددًا.')}</Alert>
          )}

          {!isPending && (
            <p className="text-sm text-secondary" style={{ marginTop: 'var(--space-1)' }}>
              {status?.source === 'database'
                ? t(`Sending as ${status.user} (set from this panel).`, `يُرسل باسم ${status.user} (مضبوط من هذه اللوحة).`)
                : status?.source === 'env'
                  ? t(
                      `Sending as ${status.user} (server configuration).`,
                      `يُرسل باسم ${status.user} (إعدادات الخادم).`
                    )
                  : t(
                      'Not configured — outgoing emails cannot be sent.',
                      'غير مُعد — لا يمكن إرسال رسائل البريد الإلكتروني الصادرة.'
                    )}
            </p>
          )}

          <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)' }}>
            <Button type="button" size="sm" onClick={() => setEditing(true)}>
              {configured ? t('Change', 'تغيير') : t('Set up', 'إعداد')}
            </Button>
            {status?.source === 'database' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => clear.mutate()}
                loading={clear.isPending}
              >
                {t('Revert to server default', 'العودة إلى إعداد الخادم')}
              </Button>
            )}
          </div>
        </div>

        {editing && <SmtpCredentialDialog locale={locale} onClose={() => setEditing(false)} />}
      </div>
    </div>
  );
}

/**
 * Step-up gated server-side (requireFreshAuth on PATCH /api/admin/smtp) —
 * same "always step up first, then act" pattern as the backup page's
 * RestoreDialog: the admin's own password re-verifies freshness, then the
 * new account is submitted. The backend also runs a real SMTP handshake
 * (transporter.verify) before persisting anything, so a typo'd app password
 * surfaces here as a 400 rather than silently breaking every future email.
 */
function SmtpCredentialDialog({ locale, onClose }: { locale: 'en' | 'ar'; onClose: () => void }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const stepUp = useStepUp();
  const setCredential = useSetSmtpCredential();
  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const busy = stepUp.isPending || setCredential.isPending;

  async function submit() {
    setError(null);
    try {
      await stepUp.mutateAsync(adminPassword);
    } catch {
      setError(t('Incorrect password.', 'كلمة المرور غير صحيحة.'));
      return;
    }
    try {
      await setCredential.mutateAsync({ email, appPassword });
      onClose();
    } catch (e) {
      setError(
        isApiError(e)
          ? e.message
          : t('Could not verify those credentials. Try again.', 'تعذّر التحقّق من هذه البيانات. حاول مجددًا.')
      );
    }
  }

  return (
    <Modal open onClose={onClose} title={t('Outgoing mail account', 'حساب البريد الصادر')}>
      <div className="stack" style={{ padding: 'var(--space-5)', maxWidth: '28rem' }}>
        <h2 style={{ margin: 0 }}>{t('Outgoing mail account', 'حساب البريد الصادر')}</h2>
        <p className="prose" style={{ fontSize: 'var(--fs-sm)' }}>
          {t(
            'Use a Gmail address and its 16-character app password (Google Account → Security → App passwords), not your regular Gmail password.',
            'استخدم عنوان Gmail وكلمة مرور التطبيق المكوّنة من 16 حرفًا (حساب Google ← الأمان ← كلمات مرور التطبيقات)، وليس كلمة مرور Gmail العادية.'
          )}
        </p>
        <Field label={t('Gmail address', 'عنوان Gmail')}>
          {(p) => (
            <Input
              {...p}
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          )}
        </Field>
        <Field label={t('App password', 'كلمة مرور التطبيق')}>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="off"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              disabled={busy}
            />
          )}
        </Field>
        <Field label={t('Your password, to confirm', 'كلمة مرورك، للتأكيد')}>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              disabled={busy}
            />
          )}
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="admin-form__actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t('Cancel', 'إلغاء')}
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            loading={busy}
            disabled={!email || !appPassword || !adminPassword}
          >
            {t('Save', 'حفظ')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
