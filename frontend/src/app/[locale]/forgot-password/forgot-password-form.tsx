'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, Field, Input } from '@/components/ui';
import { useForgotPassword } from '@/hooks/use-auth';
import { isApiError } from '@/lib/api';

type Locale = 'en' | 'ar';
type Status = 'idle' | 'success' | 'rate-limited' | 'error';

const schema = z.object({
  email: z.string().email(),
});
type Values = z.infer<typeof schema>;

export function ForgotPasswordForm({ locale }: { locale: Locale }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const forgotPassword = useForgotPassword();
  const [status, setStatus] = useState<Status>('idle');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await forgotPassword.mutateAsync({ email: values.email, locale });
      // Always this branch on a 200 — the backend's response is identical
      // whether or not the email matched an account, so the form has no way
      // (and must make no attempt) to tell those two cases apart.
      setStatus('success');
    } catch (err) {
      // 429 (rate limited) and a genuine network/5xx failure are NOT
      // account-existence signals — they fire the same regardless of what
      // email was typed — so it's safe (and better UX) to show them
      // distinctly from the "request accepted" state above.
      setStatus(isApiError(err) && err.status === 429 ? 'rate-limited' : 'error');
    }
  });

  const busy = isSubmitting || forgotPassword.isPending;

  return (
    <div className="section" style={{ maxWidth: '22rem', marginInline: 'auto' }}>
      <p className="eyebrow">{t("Ali's Store", 'متجر علي')}</p>
      <h1>{t('Forgot your password?', 'نسيت كلمة المرور؟')}</h1>

      {status === 'success' ? (
        <div style={{ marginBlockStart: 'var(--space-5)' }}>
          <Alert tone="success">
            {t(
              'If an account exists for this email, a reset link has been sent.',
              'إذا كان هناك حساب مرتبط بهذا البريد، فقد تم إرسال رابط لإعادة التعيين.'
            )}
          </Alert>
        </div>
      ) : (
        <>
          <p className="prose" style={{ marginBlockStart: 'var(--space-3)' }}>
            {t(
              "Enter the email on your account and we'll send a link to reset your password.",
              'أدخل البريد الإلكتروني الخاص بحسابك وسنرسل رابطًا لإعادة تعيين كلمة المرور.'
            )}
          </p>

          {status === 'rate-limited' && (
            <div style={{ marginBlockStart: 'var(--space-3)' }}>
              <Alert tone="warning">
                {t(
                  'Too many requests. Please wait a while before trying again.',
                  'عدد كبير جدًا من المحاولات. يرجى الانتظار قليلاً قبل إعادة المحاولة.'
                )}
              </Alert>
            </div>
          )}
          {status === 'error' && (
            <div style={{ marginBlockStart: 'var(--space-3)' }}>
              <Alert tone="danger">
                {t('Something went wrong. Please try again.', 'حدث خطأ ما. يرجى المحاولة مرة أخرى.')}
              </Alert>
            </div>
          )}

          <form
            onSubmit={onSubmit}
            noValidate
            className="stack"
            style={{ marginBlockStart: 'var(--space-5)' }}
          >
            <Field
              label={t('Email', 'البريد الإلكتروني')}
              error={errors.email && t('Enter a valid email address.', 'أدخل بريدًا إلكترونيًا صالحًا.')}
            >
              {(p) => (
                <Input
                  {...p}
                  {...register('email')}
                  type="email"
                  autoComplete="email"
                  autoFocus
                  disabled={busy}
                />
              )}
            </Field>

            <Button type="submit" loading={busy} block>
              {t('Send reset link', 'إرسال رابط إعادة التعيين')}
            </Button>
          </form>
        </>
      )}

      <p className="prose" style={{ marginBlockStart: 'var(--space-5)' }}>
        <Link href={`/${locale}/login`}>{t('Back to sign in', 'العودة إلى تسجيل الدخول')}</Link>
      </p>
    </div>
  );
}
