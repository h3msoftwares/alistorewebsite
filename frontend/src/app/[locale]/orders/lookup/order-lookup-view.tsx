'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, Field, Input } from '@/components/ui';
import { useLookupOrder } from '@/hooks/use-orders';

type Locale = 'en' | 'ar';

const schema = z.object({
  orderNumber: z.string().trim().min(1),
  contact: z.string().trim().min(1),
});
type Values = z.infer<typeof schema>;

/** The manual fallback for a guest without (or who lost) their tracking
 *  link — order number + the email or phone used at checkout. A mismatch
 *  (wrong order number, or right order number but wrong contact) shows the
 *  exact same generic message either way — the backend responds identically
 *  in both cases, so there's nothing more specific to show. */
export function OrderLookupView({ locale }: { locale: Locale }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();

  const lookup = useLookupOrder();
  const [notFound, setNotFound] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setNotFound(false);
    try {
      const token = await lookup.mutateAsync(values);
      router.push(`/${locale}/orders/track/${token}`);
    } catch {
      setNotFound(true);
    }
  });

  const busy = lookup.isPending;

  return (
    <div className="container section--tight">
      <h1 style={{ marginBlockStart: 0 }}>{t('Track your order', 'تتبّع طلبك')}</h1>
      <p className="prose">
        {t(
          "Enter your order number and the email or phone you checked out with, and we'll take you to your order.",
          'أدخل رقم طلبك والبريد الإلكتروني أو الهاتف الذي استخدمته عند إتمام الطلب، وسننقلك إلى طلبك.'
        )}
      </p>

      <form className="admin-form" noValidate onSubmit={onSubmit} style={{ maxWidth: '28rem' }}>
        <Field label={t('Order number', 'رقم الطلب')} error={errors.orderNumber?.message} required>
          {(p) => <Input {...p} {...register('orderNumber')} placeholder="AS-20260101-ABC123" disabled={busy} />}
        </Field>
        <Field label={t('Email or phone used at checkout', 'البريد الإلكتروني أو الهاتف عند الطلب')} error={errors.contact?.message} required>
          {(p) => <Input {...p} {...register('contact')} disabled={busy} />}
        </Field>

        {notFound && (
          <Alert tone="danger">
            {t(
              "We couldn't find a matching order. Check the order number and contact info.",
              'تعذّر العثور على طلب مطابق. تحقّق من رقم الطلب وبيانات التواصل.'
            )}
          </Alert>
        )}

        <div className="admin-form__actions">
          <Button type="submit" loading={busy}>
            {t('Find my order', 'البحث عن طلبي')}
          </Button>
        </div>
      </form>
    </div>
  );
}
