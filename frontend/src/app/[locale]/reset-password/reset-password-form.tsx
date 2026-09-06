'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react';
import { Alert, Button, EmptyState, Field, Input } from '@/components/ui';
import { useResetPassword } from '@/hooks/use-auth';
import { isApiError } from '@/lib/api';
import { takeResetReturn } from '@/lib/reset-return';

type Locale = 'en' | 'ar';
type Status = 'idle' | 'success' | 'invalid' | 'error';

// Same floor as registration / the backend's resetPasswordSchema.
const schema = z
  .object({
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'mismatch',
  });
type Values = z.infer<typeof schema>;

export function ResetPasswordForm({ locale, token }: { locale: Locale; token: string }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();
  const resetPassword = useResetPassword();
  const [status, setStatus] = useState<Status>('idle');
  // Set on success: a path means "flow started from the account page —
  // redirect there"; null means the normal logged-out flow ("Go to sign in").
  const [returnPath, setReturnPath] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await resetPassword.mutateAsync({ token, newPassword: values.newPassword });
      // If the flow started from the account page, send them back there
      // rather than to sign-in. The hint is consumed here (one-shot).
      const dest = takeResetReturn();
      setReturnPath(dest);
      setStatus('success');
      if (dest) router.replace(dest);
    } catch (err) {
      // The backend collapses "not found" / "expired" / "already used" into
      // one 401 on purpose — mirror that here instead of guessing which.
      setStatus(isApiError(err) && err.status === 401 ? 'invalid' : 'error');
    }
  });

  const busy = isSubmitting || resetPassword.isPending;
  const wrap = (child: React.ReactNode) => (
    <div className="section" style={{ maxWidth: '22rem', marginInline: 'auto' }}>
      {child}
    </div>
  );

  if (!token) {
    return wrap(
      <EmptyState
        tone="alert"
        icon={KeyRound}
        title={t('Invalid reset link', 'رابط إعادة التعيين غير صالح')}
        body={t(
          'This link is missing its token — copy it directly from the email you received.',
          'هذا الرابط لا يحتوي على الرمز اللازم — انسخه مباشرة من البريد الإلكتروني الذي استلمته.'
        )}
        action={
          <Link className="btn btn--primary" href={`/${locale}/forgot-password`}>
            {t('Request a new link', 'طلب رابط جديد')}
          </Link>
        }
      />
    );
  }

  if (status === 'success') {
    // Flow started from the account page: confirm briefly, then redirect
    // back there (the effect above calls router.replace).
    if (returnPath) {
      return wrap(
        <>
          <Alert tone="success">
            {t(
              'Your password has been changed. Taking you back to your account…',
              'تم تغيير كلمة المرور. جارٍ إعادتك إلى حسابك…'
            )}
          </Alert>
          <p className="prose" style={{ marginBlockStart: 'var(--space-5)' }}>
            <Link className="btn btn--primary" href={returnPath}>
              {t('Continue', 'متابعة')}
            </Link>
          </p>
        </>
      );
    }

    // Normal logged-out flow.
    return wrap(
      <>
        <Alert tone="success">
          {t(
            'Your password has been reset. You can now sign in.',
            'تم إعادة تعيين كلمة المرور. يمكنك الآن تسجيل الدخول.'
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

  if (status === 'invalid') {
    return wrap(
      <EmptyState
        tone="alert"
        icon={KeyRound}
        title={t('This link is invalid or has expired', 'هذا الرابط غير صالح أو منتهي الصلاحية')}
        body={t(
          'Reset links expire after a while and can only be used once. Request a new one.',
          'روابط إعادة التعيين تنتهي صلاحيتها بعد فترة ولا يمكن استخدامها إلا مرة واحدة. اطلب رابطًا جديدًا.'
        )}
        action={
          <Link className="btn btn--primary" href={`/${locale}/forgot-password`}>
            {t('Request a new link', 'طلب رابط جديد')}
          </Link>
        }
      />
    );
  }

  return wrap(
    <>
      <p className="eyebrow">{t("Ali's Store", 'متجر علي')}</p>
      <h1>{t('Choose a new password', 'اختر كلمة مرور جديدة')}</h1>

      {status === 'error' && (
        <div style={{ marginBlockStart: 'var(--space-3)' }}>
          <Alert tone="danger">
            {t('Something went wrong. Please try again.', 'حدث خطأ ما. يرجى المحاولة مرة أخرى.')}
          </Alert>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="stack" style={{ marginBlockStart: 'var(--space-5)' }}>
        <Field
          label={t('New password', 'كلمة المرور الجديدة')}
          error={errors.newPassword && t('Must be at least 8 characters.', 'يجب أن تتكون من 8 أحرف على الأقل.')}
        >
          {(p) => (
            <Input
              {...p}
              {...register('newPassword')}
              type="password"
              autoComplete="new-password"
              autoFocus
              disabled={busy}
            />
          )}
        </Field>

        <Field
          label={t('Confirm new password', 'تأكيد كلمة المرور الجديدة')}
          error={errors.confirmPassword && t("Passwords don't match.", 'كلمتا المرور غير متطابقتين.')}
        >
          {(p) => (
            <Input
              {...p}
              {...register('confirmPassword')}
              type="password"
              autoComplete="new-password"
              disabled={busy}
            />
          )}
        </Field>

        <Button type="submit" loading={busy} block>
          {t('Reset password', 'إعادة تعيين كلمة المرور')}
        </Button>
      </form>
    </>
  );
}
