'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, Field, Input } from '@/components/ui';
import { useAdminLogin } from '@/hooks/use-auth';

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

  return (
    <div className="section" style={{ maxWidth: '22rem', marginInline: 'auto' }}>
      <p className="eyebrow">{t("Ali's Store", 'متجر علي')}</p>
      <h1>{t('Admin sign in', 'دخول لوحة الإدارة')}</h1>

      {adminLogin.isError && (
        <Alert tone="danger" className="stack">
          {t('Invalid credentials.', 'بيانات الدخول غير صحيحة.')}
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
    </div>
  );
}
