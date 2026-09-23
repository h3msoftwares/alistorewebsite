'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Badge, Button, Field, Input, Skeleton } from '@/components/ui';
import { useAuth, useChangePassword, useRequestEmailChange } from '@/hooks/use-auth';
import { useProfile, useUpdateProfile } from '@/hooks/use-account';
import { isApiError } from '@/lib/api';

type Locale = 'en' | 'ar';

// Same fields/limits as backend user.schema.ts's updateProfileSchema.
// Unlike the storefront /account page's ProfileSection (name only — a
// customer's contact number lives on their delivery Address), staff/admin
// have no address concept, so `phone` is edited directly here.
const profileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.union([z.literal(''), z.string().trim().min(6).max(30)]),
});
type ProfileValues = z.infer<typeof profileSchema>;

// Same shape/messages as account-view.tsx's SecuritySection — this is the
// exact same backend endpoint (POST /api/auth/change-password), just
// surfaced in the admin panel too.
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, { message: 'At least 8 characters' }).max(200),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from your current one',
  });
type PasswordValues = z.infer<typeof passwordSchema>;

const emailChangeSchema = z.object({
  newEmail: z.string().trim().email(),
  currentPassword: z.string().min(1),
});
type EmailChangeValues = z.infer<typeof emailChangeSchema>;

export default function AdminProfilePage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as Locale;
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('My profile', 'ملفي الشخصي')}</h1>
      </div>
      <p className="admin-form__hint">
        {t(
          'Manage your own name, contact number, and sign-in credentials. This only affects your account.',
          'إدارة اسمك ورقم التواصل وبيانات تسجيل الدخول الخاصة بك. يؤثر هذا على حسابك فقط.'
        )}
      </p>

      <ProfileSection locale={locale} />
      <PasswordSection locale={locale} />
      <EmailSection locale={locale} />
    </div>
  );
}

function ProfileSection({ locale }: { locale: Locale }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { data: profile, isPending } = useProfile();
  const update = useUpdateProfile();
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: profile ? { name: profile.name, phone: profile.phone ?? '' } : undefined,
  });

  if (isPending || !profile) {
    return (
      <section className="admin-form__section">
        <p className="admin-form__section-title">{t('Profile', 'الملف الشخصي')}</p>
        <Skeleton variant="text" width="100%" />
      </section>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false);
    try {
      await update.mutateAsync({ name: values.name, phone: values.phone.trim() === '' ? null : values.phone.trim() });
      reset(values);
      setSaved(true);
    } catch {
      /* surfaced below */
    }
  });

  const busy = isSubmitting || update.isPending;

  return (
    <section className="admin-form__section">
      <p className="admin-form__section-title">{t('Profile', 'الملف الشخصي')}</p>

      <p className="admin-form__hint">
        {t('Email', 'البريد الإلكتروني')}: <strong>{profile.email}</strong>{' '}
        {profile.emailVerified ? (
          <Badge variant="save">{t('Verified', 'مُوثَّق')}</Badge>
        ) : (
          <Badge variant="sale">{t('Unverified', 'غير مُوثَّق')}</Badge>
        )}
      </p>

      {saved && (
        <Alert tone="success" className="stack">
          {t('Profile updated.', 'تم تحديث الملف الشخصي.')}
        </Alert>
      )}
      {update.isError && (
        <Alert tone="danger" className="stack">
          {isApiError(update.error) && update.error.status === 409
            ? t('That phone number is already in use.', 'رقم الهاتف هذا مُستخدَم بالفعل.')
            : t('Could not save your changes. Try again.', 'تعذّر حفظ التغييرات. حاول مرة أخرى.')}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="admin-form">
        <div className="admin-form__row">
          <Field label={t('Name', 'الاسم')} error={errors.name && t('Required', 'مطلوب')}>
            {(p) => <Input {...p} {...register('name')} autoComplete="name" disabled={busy} />}
          </Field>
          <Field
            label={t('Phone', 'الهاتف')}
            hint={t('Optional', 'اختياري')}
            error={errors.phone && t('Enter a valid phone number, or leave blank', 'أدخل رقم هاتف صالحًا أو اتركه فارغًا')}
          >
            {(p) => <Input {...p} {...register('phone')} type="tel" autoComplete="tel" disabled={busy} />}
          </Field>
        </div>
        <div className="admin-form__actions">
          <Button type="submit" loading={busy} disabled={!isDirty}>
            {t('Save changes', 'حفظ التغييرات')}
          </Button>
        </div>
      </form>
    </section>
  );
}

function PasswordSection({ locale }: { locale: Locale }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const change = useChangePassword();
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false);
    try {
      await change.mutateAsync({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSaved(true);
    } catch {
      /* surfaced below */
    }
  });

  // The API returns 400 only when the current password is wrong (and 429
  // when rate-limited) — everything else is a generic failure. Same mapping
  // as account-view.tsx's SecuritySection.
  const wrongCurrent = change.isError && isApiError(change.error) && change.error.status === 400;
  const rateLimited = change.isError && isApiError(change.error) && change.error.status === 429;
  const busy = isSubmitting || change.isPending;

  return (
    <section className="admin-form__section">
      <p className="admin-form__section-title">{t('Password', 'كلمة المرور')}</p>

      {saved && (
        <Alert tone="success" className="stack">
          {t(
            'Password changed. Other devices have been signed out.',
            'تم تغيير كلمة المرور. تم تسجيل الخروج من الأجهزة الأخرى.'
          )}
        </Alert>
      )}
      {change.isError && (
        <Alert tone="danger" className="stack">
          {wrongCurrent
            ? t('Your current password is incorrect.', 'كلمة المرور الحالية غير صحيحة.')
            : rateLimited
              ? t('Too many attempts. Try again later.', 'محاولات كثيرة. حاول لاحقًا.')
              : t('Could not change your password. Try again.', 'تعذّر تغيير كلمة المرور. حاول مرة أخرى.')}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="admin-form">
        <div className="admin-form__row">
          <Field label={t('Current password', 'كلمة المرور الحالية')} error={errors.currentPassword && t('Required', 'مطلوب')}>
            {(p) => <Input {...p} {...register('currentPassword')} type="password" autoComplete="current-password" disabled={busy} />}
          </Field>
          <Field
            label={t('New password', 'كلمة المرور الجديدة')}
            error={errors.newPassword?.message && t(errors.newPassword.message, 'كلمة المرور غير صالحة')}
          >
            {(p) => <Input {...p} {...register('newPassword')} type="password" autoComplete="new-password" disabled={busy} />}
          </Field>
        </div>
        <div className="admin-form__row">
          <Field
            label={t('Confirm new password', 'تأكيد كلمة المرور الجديدة')}
            error={errors.confirmPassword?.message && t('Passwords do not match', 'كلمتا المرور غير متطابقتين')}
          >
            {(p) => <Input {...p} {...register('confirmPassword')} type="password" autoComplete="new-password" disabled={busy} />}
          </Field>
        </div>
        <div className="admin-form__actions">
          <Button type="submit" loading={busy}>
            {t('Change password', 'تغيير كلمة المرور')}
          </Button>
        </div>
      </form>
    </section>
  );
}

// Admin-only (see backend email-change.routes.ts's requireRole('ADMIN')) —
// not a general STAFF feature, so this renders nothing for anyone else
// rather than showing a form that would just 403. Checked against the exact
// role, not the broader `isAdmin` flag (which also covers STAFF) — same fix
// as account-view.tsx's EmailSection.
function EmailSection({ locale }: { locale: Locale }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const requestChange = useRequestEmailChange();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EmailChangeValues>({ resolver: zodResolver(emailChangeSchema) });

  if (user?.role !== 'ADMIN') return null;

  const onSubmit = handleSubmit(async (values) => {
    try {
      await requestChange.mutateAsync({ newEmail: values.newEmail, currentPassword: values.currentPassword, locale });
      reset({ newEmail: '', currentPassword: '' });
    } catch {
      /* surfaced below */
    }
  });

  const wrongCurrent =
    requestChange.isError && isApiError(requestChange.error) && requestChange.error.status === 400;
  const rateLimited =
    requestChange.isError && isApiError(requestChange.error) && requestChange.error.status === 429;
  const busy = isSubmitting || requestChange.isPending;

  return (
    <section className="admin-form__section">
      <p className="admin-form__section-title">{t('Email', 'البريد الإلكتروني')}</p>

      {profile?.email && (
        <p className="admin-form__hint">
          {t('Current email: ', 'البريد الإلكتروني الحالي: ')}
          <strong>{profile.email}</strong>
        </p>
      )}

      {requestChange.isSuccess && (
        <Alert tone="success" className="stack">
          {t(
            'If that email is available, a confirmation link has been sent to it. Nothing changes until you click it.',
            'إذا كان هذا البريد متاحًا، فقد تم إرسال رابط تأكيد إليه. لن يتغيّر شيء حتى تنقر عليه.'
          )}
        </Alert>
      )}
      {requestChange.isError && (
        <Alert tone="danger" className="stack">
          {wrongCurrent
            ? t('Your current password is incorrect.', 'كلمة المرور الحالية غير صحيحة.')
            : rateLimited
              ? t('Too many attempts. Try again later.', 'محاولات كثيرة. حاول لاحقًا.')
              : t('Could not request the change. Try again.', 'تعذّر طلب التغيير. حاول مرة أخرى.')}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="admin-form">
        <div className="admin-form__row">
          <Field
            label={t('New email', 'البريد الإلكتروني الجديد')}
            error={errors.newEmail && t('Enter a valid email', 'أدخل بريدًا إلكترونيًا صالحًا')}
          >
            {(p) => <Input {...p} {...register('newEmail')} type="email" autoComplete="email" disabled={busy} />}
          </Field>
          <Field label={t('Current password', 'كلمة المرور الحالية')} error={errors.currentPassword && t('Required', 'مطلوب')}>
            {(p) => <Input {...p} {...register('currentPassword')} type="password" autoComplete="current-password" disabled={busy} />}
          </Field>
        </div>
        <div className="admin-form__actions">
          <Button type="submit" loading={busy}>
            {t('Send confirmation link', 'إرسال رابط التأكيد')}
          </Button>
        </div>
      </form>
    </section>
  );
}
