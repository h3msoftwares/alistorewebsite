'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, EmptyState, ProductGridSkeleton } from '@/components/ui';
import { useComboRule, useUpdateComboRule } from '@/hooks/use-combos';
import {
  blankComboRuleValues,
  ComboCoveragePreviewSection,
  comboRuleBodyFromValues,
  comboRuleSchema,
  comboRuleValuesFromExisting,
  ComboRuleFormFields,
  type ComboRuleFormValues,
} from '../combo-rule-form';

export default function EditComboRulePage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const id = typeof params?.id === 'string' ? params.id : '';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();

  const { data: comboRule, isPending } = useComboRule(id);
  const update = useUpdateComboRule();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ComboRuleFormValues>({
    resolver: zodResolver(comboRuleSchema),
    values: comboRule ? comboRuleValuesFromExisting(comboRule) : undefined,
    defaultValues: blankComboRuleValues,
  });

  const busy = update.isPending;

  const onSubmit = async (form: ComboRuleFormValues) => {
    setError(null);
    try {
      await update.mutateAsync({ id, body: comboRuleBodyFromValues(form) });
      router.push(`/${locale}/admin/combos`);
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

  if (!comboRule) {
    return (
      <div className="section--tight">
        <EmptyState tone="alert" title={t("Couldn't find this combo rule", 'تعذّر إيجاد قاعدة التجميع هذه')} />
      </div>
    );
  }

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{isAr ? comboRule.nameAr : comboRule.nameEn}</h1>
        <Link href={`/${locale}/admin/combos`} className="btn btn--ghost">
          {t('Back to list', 'العودة إلى القائمة')}
        </Link>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="admin-form">
        <ComboRuleFormFields
          register={register}
          control={control}
          errors={errors}
          busy={busy}
          locale={locale}
          initialProductDetails={Object.fromEntries(comboRule.products.map((p) => [p.productID, p.product]))}
        />
        <ComboCoveragePreviewSection getValues={getValues} locale={locale} />

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
