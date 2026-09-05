'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, Field, Input } from '@/components/ui';
import { useLogin } from '@/hooks/use-auth';
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

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      router.replace(next ?? `/${locale}`);
    } catch {
      // Bad credentials, locked out, rate limited — all show the same generic
      // message below. The backend returns an identical 401 for every
      // credential failure; the form must not try to tell them apart.
    }
  });

  const busy = isSubmitting || login.isPending;
  const rateLimited = login.isError && isApiError(login.error) && login.error.status === 429;

  return (
    <div className="section" style={{ maxWidth: '22rem', marginInline: 'auto' }}>
      <p className="eyebrow">{t("Ali's Store", 'متجر علي')}</p>
      <h1>{t('Sign in', 'تسجيل الدخول')}</h1>

      {login.isError && (
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
        {t('New to Ali’s Store? ', 'جديد في متجر علي؟ ')}
        <Link href={`/${locale}/register`}>{t('Create an account', 'أنشئ حسابًا')}</Link>
      </p>
    </div>
  );
}
