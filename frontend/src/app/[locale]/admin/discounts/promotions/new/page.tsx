'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button } from '@/components/ui';
import { useCreatePromotion } from '@/hooks/use-discounts';
import {
  blankPromotionValues,
  CoveragePreviewSection,
  promotionBodyFromValues,
  promotionSchema,
  PromotionFormFields,
  type PromotionFormValues,
} from '../../promotion-form';

export default function NewPromotionPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();
  const create = useCreatePromotion();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<PromotionFormValues>({ resolver: zodResolver(promotionSchema), defaultValues: blankPromotionValues });

  const busy = create.isPending;

  const onSubmit = async (form: PromotionFormValues) => {
    setError(null);
    try {
      await create.mutateAsync(promotionBodyFromValues(form));
      router.push(`/${locale}/admin/discounts`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('New promotion', 'عرض جديد')}</h1>
        <Link href={`/${locale}/admin/discounts`} className="btn btn--ghost">
          {t('Cancel', 'إلغاء')}
        </Link>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="admin-form">
        <PromotionFormFields register={register} control={control} errors={errors} busy={busy} locale={locale} />
        <CoveragePreviewSection getValues={getValues} locale={locale} />

        {error && (
          <Alert tone="danger" className="stack">
            {error}
          </Alert>
        )}

        <div className="admin-form__actions">
          <Button type="submit" loading={busy}>
            {t('Add promotion', 'إضافة العرض')}
          </Button>
        </div>
      </form>
    </div>
  );
}
