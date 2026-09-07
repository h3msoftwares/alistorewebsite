'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MailCheck } from 'lucide-react';
import { Alert, Button, EmptyState, Field, Input, Select, Textarea } from '@/components/ui';
import { useRegister, useResendVerification } from '@/hooks/use-auth';
import { useDeliveryRegionOptions } from '@/lib/use-delivery-region-options';
import { isApiError } from '@/lib/api';

type Locale = 'en' | 'ar';

// Mirrors the backend registerSchema (auth.schema.ts) + createAddressSchema.
// `confirmPassword` is client-only — checked here, then dropped before the
// request (the backend never sees it).
const schema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(1),
    name: z.string().min(1).max(120),
    address: z.object({
      phone: z.string().min(6).max(30),
      addressLine: z.string().min(3).max(300),
      city: z.string().min(1).max(120),
      region: z.string().trim().min(1).max(60),
      area: z.string().max(120).optional(),
      notes: z.string().max(500).optional(),
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
type Values = z.infer<typeof schema>;

export function RegisterForm({ locale, defaultEmail = '' }: { locale: Locale; defaultEmail?: string }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const registerMut = useRegister();
  const resend = useResendVerification();
  const regionOptions = useDeliveryRegionOptions(locale);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<'none' | 'rate-limited' | 'generic'>('none');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaultEmail ? { email: defaultEmail } : undefined,
  });

  const onSubmit = handleSubmit(async (values) => {
    setError('none');
    try {
      // `confirmPassword` is a client-only match check — never sent.
      await registerMut.mutateAsync({
        email: values.email,
        password: values.password,
        name: values.name,
        address: values.address,
        locale,
      });
      // Always this branch on 201 — the backend's response is identical
      // whether the email was new or already in use. Never infer which.
      setSubmittedEmail(values.email);
    } catch (err) {
      setError(isApiError(err) && err.status === 429 ? 'rate-limited' : 'generic');
    }
  });

  const busy = isSubmitting || registerMut.isPending;
  const wrap = (child: React.ReactNode) => (
    <div className="section" style={{ maxWidth: '30rem', marginInline: 'auto' }}>{child}</div>
  );

  if (submittedEmail) {
    return wrap(
      <EmptyState
        icon={MailCheck}
        title={t('Check your email', 'تحقّق من بريدك الإلكتروني')}
        body={t(
          `If this email isn't already in use, we've sent a verification link to ${submittedEmail}. Click it to finish setting up your account, then sign in.`,
          `إذا لم يكن هذا البريد مستخدمًا بالفعل، فقد أرسلنا رابط تحقّق إلى ${submittedEmail}. اضغط عليه لإكمال إعداد حسابك، ثم سجّل الدخول.`
        )}
        action={
          <div className="stack" style={{ alignItems: 'center' }}>
            <Link className="btn btn--primary" href={`/${locale}/login`}>
              {t('Go to sign in', 'الذهاب إلى تسجيل الدخول')}
            </Link>
            {resent ? (
              <span className="prose" style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-muted)' }}>
                {t("If it still hasn't arrived, check your spam folder.", 'إذا لم يصل بعد، تحقّق من مجلد الرسائل غير المرغوب فيها.')}
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                loading={resend.isPending}
                onClick={async () => {
                  try {
                    await resend.mutateAsync({ email: submittedEmail, locale });
                  } finally {
                    setResent(true);
                  }
                }}
              >
                {t("Didn't get it? Resend", 'لم يصلك؟ إعادة الإرسال')}
              </Button>
            )}
          </div>
        }
      />
    );
  }

  return wrap(
    <>
      <p className="eyebrow">{t("Ali's Store", 'متجر علي')}</p>
      <h1>{t('Create your account', 'أنشئ حسابك')}</h1>

      {error !== 'none' && (
        <div style={{ marginBlockStart: 'var(--space-3)' }}>
          <Alert tone={error === 'rate-limited' ? 'warning' : 'danger'}>
            {error === 'rate-limited'
              ? t(
                  'Too many attempts. Please wait a while before trying again.',
                  'عدد كبير جدًا من المحاولات. يرجى الانتظار قليلاً قبل إعادة المحاولة.'
                )
              : t('Something went wrong. Please try again.', 'حدث خطأ ما. يرجى المحاولة مرة أخرى.')}
          </Alert>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="stack" style={{ marginBlockStart: 'var(--space-5)' }}>
        <h2 style={{ fontSize: 'var(--fs-md)' }}>{t('Account', 'الحساب')}</h2>

        <Field label={t('Full name', 'الاسم الكامل')} error={errors.name && t('Required', 'مطلوب')}>
          {(p) => <Input {...p} {...register('name')} autoComplete="name" autoFocus disabled={busy} />}
        </Field>

        <Field
          label={t('Email', 'البريد الإلكتروني')}
          error={errors.email && t('Enter a valid email address.', 'أدخل بريدًا إلكترونيًا صالحًا.')}
        >
          {(p) => <Input {...p} {...register('email')} type="email" autoComplete="email" disabled={busy} />}
        </Field>

        <Field
          label={t('Password', 'كلمة المرور')}
          error={errors.password && t('Must be at least 8 characters.', 'يجب أن تتكون من 8 أحرف على الأقل.')}
        >
          {(p) => (
            <Input {...p} {...register('password')} type="password" autoComplete="new-password" disabled={busy} />
          )}
        </Field>

        <Field
          label={t('Confirm password', 'تأكيد كلمة المرور')}
          error={
            errors.confirmPassword &&
            (errors.confirmPassword.message === 'Passwords do not match'
              ? t('Passwords do not match.', 'كلمتا المرور غير متطابقتين.')
              : t('Required', 'مطلوب'))
          }
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

        <h2 style={{ fontSize: 'var(--fs-md)', marginBlockStart: 'var(--space-4)' }}>
          {t('Delivery address', 'عنوان التوصيل')}
        </h2>

        <Field
          label={t('Contact phone', 'هاتف التواصل')}
          error={errors.address?.phone && t('Enter a valid phone number.', 'أدخل رقم هاتف صالحًا.')}
        >
          {(p) => <Input {...p} {...register('address.phone')} type="tel" autoComplete="tel" disabled={busy} />}
        </Field>

        <Field
          label={t('Street address', 'عنوان الشارع')}
          error={errors.address?.addressLine && t('Enter your street address.', 'أدخل عنوان الشارع.')}
        >
          {(p) => (
            <Input {...p} {...register('address.addressLine')} autoComplete="street-address" disabled={busy} />
          )}
        </Field>

        <Field label={t('City', 'المدينة')} error={errors.address?.city && t('Required', 'مطلوب')}>
          {(p) => <Input {...p} {...register('address.city')} autoComplete="address-level2" disabled={busy} />}
        </Field>

        <Field label={t('Governorate', 'المحافظة')} error={errors.address?.region && t('Required', 'مطلوب')}>
          {(p) => (
            <Select {...p} {...register('address.region')} defaultValue="" disabled={busy}>
              <option value="" disabled>
                {t('Select a region', 'اختر منطقة')}
              </option>
              {regionOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t('Area (optional)', 'المنطقة (اختياري)')} error={errors.address?.area && t('Too long', 'طويل جدًا')}>
          {(p) => <Input {...p} {...register('address.area')} disabled={busy} />}
        </Field>

        <Field
          label={t('Delivery notes (optional)', 'ملاحظات التوصيل (اختياري)')}
          error={errors.address?.notes && t('Too long', 'طويل جدًا')}
        >
          {(p) => <Textarea {...p} {...register('address.notes')} rows={2} disabled={busy} />}
        </Field>

        <Button type="submit" loading={busy} block>
          {t('Create account', 'إنشاء حساب')}
        </Button>
      </form>

      <p className="prose" style={{ marginBlockStart: 'var(--space-5)' }}>
        {t('Already have an account? ', 'لديك حساب بالفعل؟ ')}
        <Link href={`/${locale}/login`}>{t('Sign in', 'تسجيل الدخول')}</Link>
      </p>
    </>
  );
}
