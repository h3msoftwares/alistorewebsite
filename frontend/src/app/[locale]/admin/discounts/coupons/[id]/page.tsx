'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, EmptyState, ProductGridSkeleton } from '@/components/ui';
import { useCoupon, useUpdateCoupon } from '@/hooks/use-discounts';
import {
  blankCouponValues,
  couponBodyFromValues,
  couponSchema,
  couponValuesFromExisting,
  CouponFormFields,
  type CouponFormValues,
} from '../../coupon-form';

export default function EditCouponPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const id = typeof params?.id === 'string' ? params.id : '';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();

  const { data: coupon, isPending } = useCoupon(id);
  const update = useUpdateCoupon();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CouponFormValues>({
    resolver: zodResolver(couponSchema),
    values: coupon ? couponValuesFromExisting(coupon) : undefined,
    defaultValues: blankCouponValues,
  });

  const busy = update.isPending;

  const onSubmit = async (form: CouponFormValues) => {
    setError(null);
    try {
      await update.mutateAsync({ id, body: couponBodyFromValues(form, true) });
      router.push(`/${locale}/admin/discounts?tab=coupons`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  if (isPending) {
    return (
      <div className="section--tight">
        <ProductGridSkeleton count={1} />
      </div>
    );
  }

  if (!coupon) {
    return (
      <div className="section--tight">
        <EmptyState tone="alert" title={t("Couldn't find this coupon", 'تعذّر إيجاد هذه القسيمة')} />
      </div>
    );
  }

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{coupon.code}</h1>
        <Link href={`/${locale}/admin/discounts?tab=coupons`} className="btn btn--ghost">
          {t('Back to list', 'العودة إلى القائمة')}
        </Link>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="admin-form">
        <CouponFormFields register={register} errors={errors} busy={busy} locale={locale} isEditing />

        {error && (
          <Alert tone="danger" className="stack">
            {error}
          </Alert>
        )}

        <div className="admin-form__actions">
          <Button type="submit" loading={busy}>
            {t('Save changes', 'حفظ التغييرات')}
          </Button>
        </div>
      </form>
    </div>
  );
}
