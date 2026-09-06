'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MailCheck, MailX } from 'lucide-react';
import { Alert, Button, EmptyState, Field, Input } from '@/components/ui';
import { useResendVerification, useVerifyEmail } from '@/hooks/use-auth';
import { isApiError } from '@/lib/api';

type Locale = 'en' | 'ar';

export function VerifyEmailView({ locale, token }: { locale: Locale; token: string }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const verify = useVerifyEmail();
  const resend = useResendVerification();
  const [resendEmail, setResendEmail] = useState('');
  const [resent, setResent] = useState(false);

  // Fire the verify call exactly once, on mount, when there is a token.
  // `mutate` (not setState) — safe in an effect; the ref guards StrictMode's
  // double-invoke in dev.
  const fired = useRef(false);
  useEffect(() => {
    if (token && !fired.current) {
      fired.current = true;
      verify.mutate({ token });
    }
  }, [token, verify]);

  const wrap = (child: React.ReactNode) => (
    <div className="section" style={{ maxWidth: '24rem', marginInline: 'auto' }}>{child}</div>
  );

  if (!token) {
    return wrap(
      <EmptyState
        tone="alert"
        icon={MailX}
        title={t('Invalid verification link', 'رابط تحقّق غير صالح')}
        body={t(
          'This link is missing its token — open it directly from the email you received.',
          'هذا الرابط لا يحتوي على الرمز اللازم — افتحه مباشرة من البريد الإلكتروني الذي استلمته.'
        )}
        action={
          <Link className="btn btn--primary" href={`/${locale}/register`}>
            {t('Back to sign up', 'العودة إلى إنشاء الحساب')}
          </Link>
        }
      />
    );
  }

  if (verify.isSuccess) {
    return wrap(
      <>
        <Alert tone="success">
          {t(
            'Your email has been verified. You can now sign in.',
            'تم التحقّق من بريدك الإلكتروني. يمكنك الآن تسجيل الدخول.'
          )}
        </Alert>
        <p className="prose" style={{ marginBlockStart: 'var(--space-5)' }}>
          <Link className="btn btn--primary" href={`/${locale}/login`}>
            {t('Go to sign in', 'الذهاب إلى تسجيل الدخول')}
          </Link>
        </p>
      </>
    );
  }

  if (verify.isError) {
    const invalid = isApiError(verify.error) && verify.error.status === 401;
    return wrap(
      <EmptyState
        tone="alert"
        icon={MailX}
        title={
          invalid
            ? t('This link is invalid or has expired', 'هذا الرابط غير صالح أو منتهي الصلاحية')
            : t('Something went wrong', 'حدث خطأ ما')
        }
        body={
          invalid
            ? t(
                'Verification links expire and can only be used once. Enter your email below to get a new one.',
                'روابط التحقّق تنتهي صلاحيتها ولا يمكن استخدامها إلا مرة واحدة. أدخل بريدك الإلكتروني أدناه للحصول على رابط جديد.'
              )
            : t('Please try opening the link again.', 'يرجى محاولة فتح الرابط مرة أخرى.')
        }
        action={
          resent ? (
            <Alert tone="success">
              {t(
                "If that email needs verifying, we've sent a fresh link.",
                'إذا كان هذا البريد بحاجة إلى تحقّق، فقد أرسلنا رابطًا جديدًا.'
              )}
            </Alert>
          ) : (
            <form
              className="stack"
              style={{ width: '100%' }}
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await resend.mutateAsync({ email: resendEmail, locale });
                } finally {
                  setResent(true);
                }
              }}
            >
              <Field label={t('Email', 'البريد الإلكتروني')}>
                {(p) => (
                  <Input
                    {...p}
                    type="email"
                    autoComplete="email"
                    required
                    value={resendEmail}
                    onChange={(ev) => setResendEmail(ev.target.value)}
                    disabled={resend.isPending}
                  />
                )}
              </Field>
              <Button type="submit" loading={resend.isPending} block>
                {t('Send a new link', 'إرسال رابط جديد')}
              </Button>
            </form>
          )
        }
      />
    );
  }

  // pending / idle
  return wrap(
    <EmptyState
      icon={MailCheck}
      title={t('Verifying your email…', 'جارٍ التحقّق من بريدك…')}
      body={t('This only takes a moment.', 'لن يستغرق هذا سوى لحظة.')}
    />
  );
}
