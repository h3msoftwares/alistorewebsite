'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Badge, Button, Field, Input, Select, Skeleton, Textarea } from '@/components/ui';
import { LogoutButton } from '@/components/chrome/logout-button';
import { useDeliveryRegionOptions } from '@/lib/use-delivery-region-options';
import { regionLabel } from '@/lib/regions';
import { useAuth, useChangePassword } from '@/hooks/use-auth';
import {
  useAddresses,
  useCreateAddress,
  useDeleteAddress,
  useProfile,
  useUpdateAddress,
  useUpdateProfile,
} from '@/hooks/use-account';
import { isApiError } from '@/lib/api';
import type { Address, AddressBody } from '@/lib/types';

type Locale = 'en' | 'ar';

// `false` on the server and on the hydration render, `true` afterwards. Auth
// state is client-only (the boot refresh resolves in an effect), so branching
// on `status` before this is true risks a hydration mismatch — the server
// always renders the "loading" skeleton, but by the time this island hydrates
// the root bootstrap may have already flipped the store to "guest".
const subscribe = () => () => {};
const useHydrated = () => useSyncExternalStore(subscribe, () => true, () => false);

const profileSchema = z.object({
  name: z.string().min(1).max(120),
});
type ProfileValues = z.infer<typeof profileSchema>;

const addressSchema = z.object({
  phone: z.string().min(6).max(30),
  addressLine: z.string().min(3).max(300),
  city: z.string().min(1).max(120),
  // The governorate that prefills the checkout delivery region — this is the
  // only place a shopper can change it after sign-up.
  region: z.string().trim().min(1).max(60),
  area: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
});
type AddressValues = z.infer<typeof addressSchema>;

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

export function AccountView({ locale }: { locale: Locale }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { status } = useAuth();
  const hydrated = useHydrated();

  if (!hydrated || status === 'loading') {
    return (
      <div className="container section">
        <Skeleton variant="text" width="12rem" />
        <div style={{ marginBlockStart: 'var(--space-5)' }}>
          <Skeleton variant="text" width="100%" />
        </div>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return (
      <div className="container section">
        <h1>{t('My account', 'حسابي')}</h1>
        <div style={{ marginBlockStart: 'var(--space-4)' }}>
          <Alert tone="warning">
            {t('Please sign in to view your account.', 'يرجى تسجيل الدخول لعرض حسابك.')}
          </Alert>
        </div>
        <p className="prose" style={{ marginBlockStart: 'var(--space-4)' }}>
          <Link className="btn btn--primary" href={`/${locale}/login?next=/${locale}/account`}>
            {t('Sign in', 'تسجيل الدخول')}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="container section" style={{ maxWidth: '38rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <h1>{t('My account', 'حسابي')}</h1>
        <LogoutButton locale={locale} />
      </div>
      <ProfileSection locale={locale} />
      <SecuritySection locale={locale} />
      <AddressesSection locale={locale} />
    </div>
  );
}

function SecuritySection({ locale }: { locale: Locale }) {
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
      await change.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSaved(true);
    } catch {
      /* surfaced below */
    }
  });

  // The API returns 400 only when the current password is wrong (and 429 when
  // rate-limited) — everything else is a generic failure.
  const wrongCurrent = change.isError && isApiError(change.error) && change.error.status === 400;
  const rateLimited = change.isError && isApiError(change.error) && change.error.status === 429;
  const busy = isSubmitting || change.isPending;

  return (
    <section style={{ marginBlockStart: 'var(--space-6)' }}>
      <h2 style={{ fontSize: 'var(--fs-md)' }}>{t('Password', 'كلمة المرور')}</h2>

      {saved && (
        <div style={{ marginBlock: 'var(--space-2)' }}>
          <Alert tone="success">
            {t(
              'Password changed. Other devices have been signed out.',
              'تم تغيير كلمة المرور. تم تسجيل الخروج من الأجهزة الأخرى.'
            )}
          </Alert>
        </div>
      )}
      {change.isError && (
        <div style={{ marginBlock: 'var(--space-2)' }}>
          <Alert tone="danger">
            {wrongCurrent
              ? t('Your current password is incorrect.', 'كلمة المرور الحالية غير صحيحة.')
              : rateLimited
                ? t('Too many attempts. Try again later.', 'محاولات كثيرة. حاول لاحقًا.')
                : t('Could not change your password. Try again.', 'تعذّر تغيير كلمة المرور. حاول مرة أخرى.')}
          </Alert>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="stack" style={{ marginBlockStart: 'var(--space-3)' }}>
        <Field
          label={t('Current password', 'كلمة المرور الحالية')}
          error={errors.currentPassword && t('Required', 'مطلوب')}
        >
          {(p) => (
            <Input
              {...p}
              {...register('currentPassword')}
              type="password"
              autoComplete="current-password"
              disabled={busy}
            />
          )}
        </Field>
        <Field
          label={t('New password', 'كلمة المرور الجديدة')}
          error={errors.newPassword?.message && t(errors.newPassword.message, 'كلمة المرور غير صالحة')}
        >
          {(p) => (
            <Input
              {...p}
              {...register('newPassword')}
              type="password"
              autoComplete="new-password"
              disabled={busy}
            />
          )}
        </Field>
        <Field
          label={t('Confirm new password', 'تأكيد كلمة المرور الجديدة')}
          error={errors.confirmPassword?.message && t('Passwords do not match', 'كلمتا المرور غير متطابقتين')}
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
        <Button type="submit" loading={busy}>
          {t('Change password', 'تغيير كلمة المرور')}
        </Button>
      </form>

      <p className="prose" style={{ marginBlockStart: 'var(--space-3)', fontSize: 'var(--fs-sm)' }}>
        <Link href={`/${locale}/forgot-password?return=account`}>
          {t('Forgot your current password?', 'نسيت كلمة المرور الحالية؟')}
        </Link>
      </p>
    </section>
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
    values: profile ? { name: profile.name } : undefined,
  });

  if (isPending || !profile) {
    return (
      <section style={{ marginBlockStart: 'var(--space-6)' }}>
        <Skeleton variant="text" width="100%" />
      </section>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false);
    try {
      await update.mutateAsync(values);
      reset(values);
      setSaved(true);
    } catch {
      /* surfaced below */
    }
  });

  const busy = isSubmitting || update.isPending;

  return (
    <section style={{ marginBlockStart: 'var(--space-6)' }}>
      <h2 style={{ fontSize: 'var(--fs-md)' }}>{t('Profile', 'الملف الشخصي')}</h2>

      <p className="prose" style={{ margin: 'var(--space-2) 0' }}>
        {t('Email', 'البريد الإلكتروني')}: <strong>{profile.email}</strong>{' '}
        {profile.emailVerified ? (
          <Badge variant="save">{t('Verified', 'مُوثَّق')}</Badge>
        ) : (
          <Badge variant="sale">{t('Unverified', 'غير مُوثَّق')}</Badge>
        )}
      </p>

      {saved && (
        <div style={{ marginBlock: 'var(--space-2)' }}>
          <Alert tone="success">{t('Profile updated.', 'تم تحديث الملف الشخصي.')}</Alert>
        </div>
      )}
      {update.isError && (
        <div style={{ marginBlock: 'var(--space-2)' }}>
          <Alert tone="danger">{t('Could not save. Try again.', 'تعذّر الحفظ. حاول مرة أخرى.')}</Alert>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="stack" style={{ marginBlockStart: 'var(--space-3)' }}>
        <Field label={t('Name', 'الاسم')} error={errors.name && t('Required', 'مطلوب')}>
          {(p) => <Input {...p} {...register('name')} autoComplete="name" disabled={busy} />}
        </Field>
        <Button type="submit" loading={busy} disabled={!isDirty}>
          {t('Save changes', 'حفظ التغييرات')}
        </Button>
      </form>
    </section>
  );
}

function AddressesSection({ locale }: { locale: Locale }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { data: addresses, isPending } = useAddresses();
  const [editing, setEditing] = useState<Address | 'new' | null>(null);

  return (
    <section style={{ marginBlockStart: 'var(--space-6)' }}>
      <h2 style={{ fontSize: 'var(--fs-md)' }}>{t('Delivery addresses', 'عناوين التوصيل')}</h2>

      {isPending ? (
        <Skeleton variant="text" width="100%" />
      ) : (
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 'var(--space-3) 0 0' }}>
          {(addresses ?? []).map((a) => (
            <li
              key={a.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--space-3)',
              }}
            >
              {editing !== null && editing !== 'new' && editing.id === a.id ? (
                <AddressForm
                  locale={locale}
                  address={a}
                  onDone={() => setEditing(null)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <div>
                    <strong>
                      {a.addressLine}, {a.city}
                      {a.area ? `, ${a.area}` : ''}
                    </strong>{' '}
                    {a.isDefault && <Badge variant="save">{t('Default', 'افتراضي')}</Badge>}
                    <div className="prose" style={{ fontSize: 'var(--fs-sm)' }}>
                      {a.region ? `${regionLabel(a.region, locale)} · ` : ''}
                      {a.phone}
                    </div>
                  </div>
                  <div className="stack" style={{ alignItems: 'flex-end' }}>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(a)}>
                      {t('Edit', 'تعديل')}
                    </Button>
                    <DeleteAddressButton locale={locale} id={a.id} />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing === 'new' ? (
        <div
          style={{
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-3)',
            marginBlockStart: 'var(--space-3)',
          }}
        >
          <AddressForm locale={locale} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          style={{ marginBlockStart: 'var(--space-3)' }}
          onClick={() => setEditing('new')}
        >
          {t('Add an address', 'إضافة عنوان')}
        </Button>
      )}
    </section>
  );
}

function DeleteAddressButton({ locale, id }: { locale: Locale; id: string }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const del = useDeleteAddress();
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={del.isPending}
      onClick={() => del.mutate(id)}
    >
      {t('Delete', 'حذف')}
    </Button>
  );
}

function AddressForm({
  locale,
  address,
  onDone,
  onCancel,
}: {
  locale: Locale;
  address?: Address;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const create = useCreateAddress();
  const update = useUpdateAddress();
  const busyMut = address ? update : create;
  const regionOptions = useDeliveryRegionOptions(locale);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: address
      ? {
          phone: address.phone,
          addressLine: address.addressLine,
          city: address.city,
          region: address.region ?? undefined,
          area: address.area ?? undefined,
          notes: address.notes ?? undefined,
        }
      : undefined,
  });

  const onSubmit = handleSubmit(async (values) => {
    const body: AddressBody = values;
    try {
      if (address) await update.mutateAsync({ id: address.id, body });
      else await create.mutateAsync(body);
      onDone();
    } catch {
      /* surfaced below */
    }
  });

  const busy = isSubmitting || busyMut.isPending;

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      {busyMut.isError && <Alert tone="danger">{t('Could not save. Try again.', 'تعذّر الحفظ. حاول مرة أخرى.')}</Alert>}
      <Field label={t('Contact phone', 'هاتف التواصل')} error={errors.phone && t('Enter a valid phone number.', 'أدخل رقم هاتف صالحًا.')}>
        {(p) => <Input {...p} {...register('phone')} type="tel" disabled={busy} />}
      </Field>
      <Field label={t('Street address', 'عنوان الشارع')} error={errors.addressLine && t('Enter your street address.', 'أدخل عنوان الشارع.')}>
        {(p) => <Input {...p} {...register('addressLine')} disabled={busy} />}
      </Field>
      <Field label={t('City', 'المدينة')} error={errors.city && t('Required', 'مطلوب')}>
        {(p) => <Input {...p} {...register('city')} disabled={busy} />}
      </Field>
      <Field label={t('Governorate', 'المحافظة')} error={errors.region && t('Required', 'مطلوب')}>
        {(p) => (
          <Select {...p} {...register('region')} defaultValue="" disabled={busy}>
            <option value="" disabled>
              {t('Select a governorate', 'اختر محافظة')}
            </option>
            {regionOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('Area (optional)', 'المنطقة (اختياري)')}>
        {(p) => <Input {...p} {...register('area')} disabled={busy} />}
      </Field>
      <Field label={t('Notes (optional)', 'ملاحظات (اختياري)')}>
        {(p) => <Textarea {...p} {...register('notes')} rows={2} disabled={busy} />}
      </Field>
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <Button type="submit" loading={busy}>
          {t('Save', 'حفظ')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          {t('Cancel', 'إلغاء')}
        </Button>
      </div>
    </form>
  );
}
