'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { MailCheck, MailX } from 'lucide-react';
import { Alert, EmptyState } from '@/components/ui';
import { useConfirmEmailChange } from '@/hooks/use-auth';
import { isApiError } from '@/lib/api';

type Locale = 'en' | 'ar';

export function ConfirmEmailChangeView({ locale, token }: { locale: Locale; token: string }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const confirm = useConfirmEmailChange();

  // Fire exactly once, on mount, when there is a token — same guard as
  // verify-email-view.tsx (StrictMode double-invoke in dev).
  const fired = useRef(false);
  useEffect(() => {
    if (token && !fired.current) {
      fired.current = true;
      confirm.mutate({ token });
    }
  }, [token, confirm]);

  const wrap = (child: React.ReactNode) => (
    <div className="section" style={{ maxWidth: '24rem', marginInline: 'auto' }}>{child}</div>
  );

  if (!token) {
    return wrap(
      <EmptyState
        tone="alert"
        icon={MailX}
        title={t('Invalid confirmation link', 'رابط تأكيد غير صالح')}
        body={t(
          'This link is missing its token — open it directly from the email you received.',
          'هذا الرابط لا يحتوي على الرمز اللازم — افتحه مباشرة من البريد الإلكتروني الذي استلمته.'
        )}
        action={
          <Link className="btn btn--primary" href={`/${locale}/account`}>
            {t('Back to my account', 'العودة إلى حسابي')}
          </Link>
        }
      />
    );
  }

  if (confirm.isSuccess) {
    return wrap(
      <>
        <Alert tone="success">
          {t(
            'Your account email has been changed. Please sign in again.',
            'تم تغيير البريد الإلكتروني لحسابك. يرجى تسجيل الدخول مرة أخرى.'
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

  if (confirm.isError) {
    const expired = isApiError(confirm.error) && confirm.error.status === 401;
    const taken = isApiError(confirm.error) && confirm.error.status === 409;
    return wrap(
      <EmptyState
        tone="alert"
        icon={MailX}
        title={
          expired
            ? t('This link is invalid or has expired', 'هذا الرابط غير صالح أو منتهي الصلاحية')
            : taken
              ? t('That email is no longer available', 'هذا البريد الإلكتروني لم يعد متاحًا')
              : t('Something went wrong', 'حدث خطأ ما')
        }
        body={
          expired
            ? t(
                'Confirmation links expire and can only be used once. Request the change again from your account.',
                'روابط التأكيد تنتهي صلاحيتها ولا يمكن استخدامها إلا مرة واحدة. اطلب التغيير مرة أخرى من حسابك.'
              )
            : taken
              ? t(
                  'Someone else has taken that email in the meantime. Request the change again with a different address.',
                  'أخذ شخص آخر هذا البريد الإلكتروني في هذه الأثناء. اطلب التغيير مرة أخرى بعنوان مختلف.'
                )
              : t('Please try opening the link again.', 'يرجى محاولة فتح الرابط مرة أخرى.')
        }
        action={
          <Link className="btn btn--primary" href={`/${locale}/account`}>
            {t('Back to my account', 'العودة إلى حسابي')}
          </Link>
        }
      />
    );
  }

  // pending / idle
  return wrap(
    <EmptyState
      icon={MailCheck}
      title={t('Confirming your new email…', 'جارٍ تأكيد بريدك الإلكتروني الجديد…')}
      body={t('This only takes a moment.', 'لن يستغرق هذا سوى لحظة.')}
    />
  );
}
