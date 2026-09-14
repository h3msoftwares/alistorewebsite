'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button } from '@/components/ui';
import { useCreateCoupon } from '@/hooks/use-discounts';
import {
  blankCouponValues,
  couponBodyFromValues,
  couponSchema,
  CouponFormFields,
  type CouponFormValues,
} from '../../coupon-form';

export default function NewCouponPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();
  const create = useCreateCoupon();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CouponFormValues>({ resolver: zodResolver(couponSchema), defaultValues: blankCouponValues });

  const busy = create.isPending;

  const onSubmit = async (form: CouponFormValues) => {
    setError(null);
    try {
      await create.mutateAsync(couponBodyFromValues(form, false));
      router.push(`/${locale}/admin/discounts?tab=coupons`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('New coupon', 'قسيمة جديدة')}</h1>
        <Link href={`/${locale}/admin/discounts?tab=coupons`} className="btn btn--ghost">
          {t('Cancel', 'إلغاء')}
        </Link>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="admin-form">
        <CouponFormFields register={register} errors={errors} busy={busy} locale={locale} isEditing={false} />

        {error && (
          <Alert tone="danger" className="stack">
            {error}
          </Alert>
        )}

        <div className="admin-form__actions">
          <Button type="submit" loading={busy}>
            {t('Add coupon', 'إضافة القسيمة')}
          </Button>
        </div>
      </form>
    </div>
  );
}
