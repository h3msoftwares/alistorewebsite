'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  ProductGridSkeleton,
  Select,
  Textarea,
} from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import {
  useEmailTemplates,
  useResetEmailTemplate,
  useSendTestEmail,
  useUpdateEmailTemplate,
} from '@/hooks/use-email-templates';
import type { EmailTemplateKey } from '@/lib/types';

/**
 * Lets an admin override the subject/HTML body of any of the fixed set of
 * automated emails (order confirmation, password reset, ...) — a list-plus-
 * form editor, "Reset to default", and a "send test email" round-trip to
 * see the real rendered output rather than guessing from the markup. Every
 * email is bilingual (English + Arabic in the same message — see the
 * backend's mailer.ts bilingualSubject/bilingualHtml), so both languages are
 * edited together and saved as one unit — there's no such thing as a
 * half-translated saved template. The plain-text fallback each email also
 * sends isn't editable here — it's generated automatically and isn't shown
 * to most recipients (see lib/email-templates.ts on the backend).
 */
export function EmailTemplatesPanel({ locale }: { locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { data: templates, isPending, isError, refetch } = useEmailTemplates();
  const update = useUpdateEmailTemplate();
  const reset = useResetEmailTemplate();
  const sendTest = useSendTestEmail();
  const { user } = useAuth();

  const [selectedKey, setSelectedKey] = useState<EmailTemplateKey | null>(null);
  const selected = templates?.find((tpl) => tpl.key === selectedKey) ?? templates?.[0] ?? null;

  const [subjectEn, setSubjectEn] = useState('');
  const [subjectAr, setSubjectAr] = useState('');
  const [htmlBodyEn, setHtmlBodyEn] = useState('');
  const [htmlBodyAr, setHtmlBodyAr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testTo, setTestTo] = useState(user?.email ?? '');
  const [testSent, setTestSent] = useState(false);

  // Load the selected template's current content into the editor: on the
  // initial "no explicit choice yet, defaulting to the first template"
  // render, on switching which template is selected, AND after the server
  // content actually changes underneath the current selection (Reset to
  // default) — a dependency array keyed only on `selected.key` would miss
  // that last case, since resetting doesn't change which key is selected,
  // only what content that key now holds.
  useEffect(() => {
    if (!selected) return;
    setSubjectEn(selected.subjectEn);
    setSubjectAr(selected.subjectAr);
    setHtmlBodyEn(selected.htmlBodyEn);
    setHtmlBodyAr(selected.htmlBodyAr);
    setError(null);
    setSaved(false);
    setTestSent(false);
  }, [selected?.key, selected?.subjectEn, selected?.subjectAr, selected?.htmlBodyEn, selected?.htmlBodyAr]);

  const busy = update.isPending || reset.isPending;

  if (isPending) {
    return <ProductGridSkeleton count={2} />;
  }
  if (isError || !templates || !selected) {
    return (
      <EmptyState
        tone="alert"
        title={t("Couldn't load email templates", 'تعذّر تحميل قوالب البريد')}
        action={
          <Button variant="primary" onClick={() => refetch()}>
            {t('Retry', 'إعادة المحاولة')}
          </Button>
        }
      />
    );
  }

  const onSave = async () => {
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync({ key: selected.key, body: { subjectEn, subjectAr, htmlBodyEn, htmlBodyAr } });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  const onReset = async () => {
    if (
      !window.confirm(
        t(
          'Reset this template to its default? Your edits will be lost.',
          'إعادة هذا القالب إلى الافتراضي؟ ستُفقد تعديلاتك.'
        )
      )
    )
      return;
    setError(null);
    setSaved(false);
    try {
      await reset.mutateAsync(selected.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Reset failed', 'فشلت إعادة الضبط'));
    }
  };

  const onSendTest = async () => {
    setError(null);
    setTestSent(false);
    try {
      await sendTest.mutateAsync({ key: selected.key, to: testTo });
      setTestSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not send the test email', 'تعذّر إرسال البريد التجريبي'));
    }
  };

  const placeholders = (
    <div>
      <p className="admin-form__hint" style={{ marginBottom: 'var(--space-2)' }}>
        {t('Available placeholders for this template (same names in both languages):', 'المتغيرات المتاحة لهذا القالب (نفس الأسماء في كلتا اللغتين):')}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {selected.variables.map((v) => (
          <code
            key={v}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 6px',
              fontSize: 'var(--fs-xs)',
            }}
          >
            {'{{'}
            {v}
            {'}}'}
          </code>
        ))}
      </div>
    </div>
  );

  return (
    <div className="stack" style={{ maxWidth: '46rem' }}>
      <p className="prose">
        {t(
          'Every email sends in English and Arabic together, in one message. Edit both languages below — placeholders like {{orderNumber}} are filled in automatically when it’s sent.',
          'يُرسل كل بريد بالإنجليزية والعربية معًا، في رسالة واحدة. عدّل اللغتين أدناه — تُملأ المتغيرات مثل {{orderNumber}} تلقائيًا عند الإرسال.'
        )}
      </p>

      <Field label={t('Template', 'القالب')}>
        {(p) => (
          <Select
            {...p}
            value={selected.key}
            onChange={(e) => setSelectedKey(e.target.value as EmailTemplateKey)}
            disabled={busy}
          >
            {templates.map((tpl) => (
              <option key={tpl.key} value={tpl.key}>
                {tpl.label}
                {tpl.isCustomized ? t(' (customized)', ' (مخصّص)') : ''}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <p className="admin-form__hint">{selected.trigger}</p>

      <div className="admin-form__section">
        <p className="admin-form__section-title">{t('English', 'الإنجليزية')}</p>
        <Field label={t('Subject', 'العنوان')}>
          {(p) => <Input {...p} value={subjectEn} onChange={(e) => setSubjectEn(e.target.value)} disabled={busy} />}
        </Field>
        <Field label={t('Body (HTML)', 'المحتوى (HTML)')}>
          {(p) => (
            <Textarea
              {...p}
              rows={12}
              value={htmlBodyEn}
              onChange={(e) => setHtmlBodyEn(e.target.value)}
              disabled={busy}
              style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--fs-sm)' }}
            />
          )}
        </Field>
      </div>

      <div className="admin-form__section">
        <p className="admin-form__section-title">{t('Arabic', 'العربية')}</p>
        <Field label={t('Subject', 'العنوان')}>
          {(p) => (
            <Input {...p} dir="rtl" value={subjectAr} onChange={(e) => setSubjectAr(e.target.value)} disabled={busy} />
          )}
        </Field>
        <Field label={t('Body (HTML)', 'المحتوى (HTML)')}>
          {(p) => (
            <Textarea
              {...p}
              dir="rtl"
              rows={12}
              value={htmlBodyAr}
              onChange={(e) => setHtmlBodyAr(e.target.value)}
              disabled={busy}
              style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--fs-sm)' }}
            />
          )}
        </Field>
      </div>

      {placeholders}

      {error && (
        <Alert tone="danger" className="stack">
          {error}
        </Alert>
      )}
      {saved && !error && (
        <Alert tone="success" className="stack">
          {t('Template saved.', 'تم حفظ القالب.')}
        </Alert>
      )}

      <div className="admin-form__actions">
        <Button type="button" onClick={() => void onSave()} loading={update.isPending}>
          {t('Save template', 'حفظ القالب')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void onReset()}
          loading={reset.isPending}
          disabled={!selected.isCustomized}
        >
          {t('Reset to default', 'إعادة إلى الافتراضي')}
        </Button>
      </div>

      <div className="admin-form__section" style={{ marginTop: 'var(--space-2)' }}>
        <p className="admin-form__section-title">{t('Send a test email', 'إرسال بريد تجريبي')}</p>
        <p className="admin-form__hint">
          {t(
            'Sends this template filled in with sample data, in both languages.',
            'يُرسل هذا القالب معبّأً ببيانات تجريبية، باللغتين.'
          )}
        </p>
        <div className="admin-form__row" style={{ alignItems: 'end' }}>
          <Field label={t('Send to', 'الإرسال إلى')}>
            {(p) => (
              <Input
                {...p}
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                disabled={sendTest.isPending}
              />
            )}
          </Field>
          <Button
            type="button"
            variant="outline"
            onClick={() => void onSendTest()}
            loading={sendTest.isPending}
            disabled={!testTo}
          >
            {t('Send test', 'إرسال تجربة')}
          </Button>
        </div>
        {testSent && (
          <Alert tone="success" className="stack">
            {t('Test email sent.', 'تم إرسال البريد التجريبي.')}
          </Alert>
        )}
      </div>
    </div>
  );
}
