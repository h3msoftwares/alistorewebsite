'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, Field, Input } from '@/components/ui';
import { useAdminLogin, useAuth } from '@/hooks/use-auth';
import { isApiError } from '@/lib/api';

type Locale = 'en' | 'ar';

const schema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});
type Values = z.infer<typeof schema>;

export function AdminLoginForm({ locale }: { locale: Locale }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();
  const adminLogin = useAdminLogin();
  const { isAdmin } = useAuth();

  // This page sits outside the /admin subtree (and its layout guard), so it
  // handles the "already signed in" bounce itself.
  useEffect(() => {
    if (isAdmin) router.replace(`/${locale}/admin`);
  }, [isAdmin, locale, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await adminLogin.mutateAsync(values);
      router.replace(`/${locale}/admin`);
    } catch {
      // Any failure — bad credentials, not an admin, locked out, rate limited —
      // shows the same generic message below. Never surface the specific cause.
    }
  });

  const busy = isSubmitting || adminLogin.isPending;
  // A real response from the server (wrong password, not an admin, locked
  // out, rate limited) always shows the same generic message below — never
  // surface the specific cause. A network failure (server unreachable) is a
  // different kind of problem with no such sensitivity, so it gets its own,
  // more useful message instead of being lumped in as "wrong credentials."
  const unreachable = adminLogin.isError && !isApiError(adminLogin.error);

  return (
    <div className="section" style={{ maxWidth: '22rem', marginInline: 'auto' }}>
      <p className="eyebrow">{"Ali'sStore"}</p>
      <h1>{t('Admin sign in', 'دخول لوحة الإدارة')}</h1>

      {adminLogin.isError && (
        <Alert tone="danger">
          {unreachable
            ? t(
                "Couldn't reach the server. Check your connection and try again.",
                'تعذّر الوصول إلى الخادم. تحقّق من اتصالك وحاول مجددًا.'
              )
            : t('Invalid credentials.', 'بيانات الدخول غير صحيحة.')}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="stack" style={{ marginBlockStart: 'var(--space-5)' }}>
        <Field label={t('Email or phone', 'البريد الإلكتروني أو الهاتف')} error={errors.identifier && t('Required', 'مطلوب')}>
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
    </div>
  );
}
