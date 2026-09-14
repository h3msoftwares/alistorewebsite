'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, EmptyState, ProductGridSkeleton } from '@/components/ui';
import { usePromotion, useUpdatePromotion } from '@/hooks/use-discounts';
import {
  blankPromotionValues,
  CoveragePreviewSection,
  promotionBodyFromValues,
  promotionSchema,
  promotionValuesFromExisting,
  PromotionFormFields,
  type PromotionFormValues,
} from '../../promotion-form';

export default function EditPromotionPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const id = typeof params?.id === 'string' ? params.id : '';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();

  const { data: promotion, isPending, isError, refetch } = usePromotion(id);
  const update = useUpdatePromotion();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<PromotionFormValues>({
    resolver: zodResolver(promotionSchema),
    values: promotion ? promotionValuesFromExisting(promotion) : undefined,
    defaultValues: blankPromotionValues,
  });

  const busy = update.isPending;

  const onSubmit = async (form: PromotionFormValues) => {
    setError(null);
    try {
      await update.mutateAsync({ id, body: promotionBodyFromValues(form) });
      router.push(`/${locale}/admin/discounts`);
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

  if (isError || !promotion) {
    return (
      <div className="section--tight">
        <EmptyState
          tone="alert"
          title={t("Couldn't load this promotion", 'تعذّر تحميل هذا العرض')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{isAr ? promotion.nameAr : promotion.nameEn}</h1>
        <Link href={`/${locale}/admin/discounts`} className="btn btn--ghost">
          {t('Back to list', 'العودة إلى القائمة')}
        </Link>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="admin-form">
        <PromotionFormFields
          register={register}
          control={control}
          errors={errors}
          busy={busy}
          locale={locale}
          initialProductDetails={Object.fromEntries(promotion.products.map((p) => [p.productID, p.product]))}
        />
        <CoveragePreviewSection getValues={getValues} locale={locale} />

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
