'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, Field, Input } from '@/components/ui';
import { useLogin, useResendVerification } from '@/hooks/use-auth';
import { isApiError } from '@/lib/api';

type Locale = 'en' | 'ar';

const schema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});
type Values = z.infer<typeof schema>;

// Reject anything that isn't a plain same-origin path, so `?next=` can't be an
// open redirect: no protocol-relative "//evil.com", no backslash trick
// "/\evil.com" (a browser normalises "\" to "/"), no whitespace a browser
// would strip out ("/%09/evil.com" and friends).
const SAFE_NEXT = /^\/[A-Za-z0-9][A-Za-z0-9/_.~!$&'()*+,;=:@%-]*$/;

function safeNext(next: string | null): string | null {
  if (!next || next.length > 512) return null;
  return SAFE_NEXT.test(next) ? next : null;
}

export function LoginForm({ locale, next: nextRaw = null }: { locale: Locale; next?: string | null }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();
  const next = safeNext(nextRaw);
  const login = useLogin();
  const resend = useResendVerification();
  const [resent, setResent] = useState(false);

  const [resendEmail, setResendEmail] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setResent(false);
    try {
      await login.mutateAsync(values);
      router.replace(next ?? `/${locale}`);
    } catch {
      // Bad credentials / locked out / rate limited -> the same generic
      // message below. "Email not verified" (403) is handled separately.
      if (/@/.test(values.identifier)) setResendEmail(values.identifier);
    }
  });

  const busy = isSubmitting || login.isPending;
  const err = login.isError && isApiError(login.error) ? login.error : null;
  const rateLimited = err?.status === 429;
  // The backend only 403s here after the password is proven correct, so a
  // specific reason leaks nothing to anyone who doesn't hold it.
  const blocked =
    err?.status === 403 && (err.meta as { reason?: string } | undefined)?.reason === 'account_blocked';
  const unverified = err?.status === 403 && !blocked;

  return (
    <div className="section" style={{ maxWidth: '22rem', marginInline: 'auto' }}>
      <p className="eyebrow">{"Ali'sStore"}</p>
      <h1>{t('Sign in', 'تسجيل الدخول')}</h1>

      {blocked ? (
        <div style={{ marginBlockStart: 'var(--space-3)' }}>
          <Alert tone="danger">
            {t(
              'Your account has been blocked by an administrator. Please contact support if you think this is a mistake.',
              'تم حظر حسابك من قِبل المسؤول. يرجى التواصل مع الدعم إذا كنت تعتقد أن هذا خطأ.'
            )}
          </Alert>
        </div>
      ) : unverified ? (
        <div className="stack" style={{ marginBlockStart: 'var(--space-3)' }}>
          <Alert tone="warning">
            {t(
              'Your email address needs to be verified before you can sign in. Check your inbox for the verification link.',
              'يجب التحقّق من بريدك الإلكتروني قبل تسجيل الدخول. تحقّق من صندوق الوارد لديك للحصول على رابط التحقّق.'
            )}
          </Alert>
          {resent ? (
            <p className="prose" style={{ fontSize: 'var(--fs-sm)' }}>
              {t("We've sent a fresh verification link.", 'أرسلنا رابط تحقّق جديدًا.')}
            </p>
          ) : (
            <form
              className="stack"
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
              <Button type="submit" variant="ghost" size="sm" loading={resend.isPending}>
                {t('Resend verification email', 'إعادة إرسال بريد التحقّق')}
              </Button>
            </form>
          )}
        </div>
      ) : (
        err && (
          <div style={{ marginBlockStart: 'var(--space-3)' }}>
            <Alert tone={rateLimited ? 'warning' : 'danger'}>
              {rateLimited
                ? t(
                    'Too many attempts. Please wait a while before trying again.',
                    'عدد كبير جدًا من المحاولات. يرجى الانتظار قليلاً قبل إعادة المحاولة.'
                  )
                : t('Invalid email/phone or password.', 'البريد الإلكتروني/الهاتف أو كلمة المرور غير صحيحة.')}
            </Alert>
          </div>
        )
      )}

      <form onSubmit={onSubmit} noValidate className="stack" style={{ marginBlockStart: 'var(--space-5)' }}>
        <Field
          label={t('Email or phone', 'البريد الإلكتروني أو الهاتف')}
          error={errors.identifier && t('Required', 'مطلوب')}
        >
          {(p) => (
            <Input
              {...p}
              {...register('identifier')}
              type="text"
              autoComplete="username"
              autoFocus
              disabled={busy}
            />
          )}
        </Field>

        <Field label={t('Password', 'كلمة المرور')} error={errors.password && t('Required', 'مطلوب')}>
          {(p) => (
            <Input
              {...p}
              {...register('password')}
              type="password"
              autoComplete="current-password"
              disabled={busy}
            />
          )}
        </Field>

        <Button type="submit" loading={busy} block>
          {t('Sign in', 'تسجيل الدخول')}
        </Button>
      </form>

      <p className="prose" style={{ marginBlockStart: 'var(--space-5)' }}>
        <Link href={`/${locale}/forgot-password`}>{t('Forgot your password?', 'نسيت كلمة المرور؟')}</Link>
      </p>
      <p className="prose">
        {t("New to Ali'sStore? ", "جديد في Ali'sStore؟ ")}
        <Link href={`/${locale}/register`}>{t('Create an account', 'أنشئ حسابًا')}</Link>
      </p>
    </div>
  );
}
