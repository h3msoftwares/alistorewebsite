'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button } from '@/components/ui';
import { useCreateComboRule } from '@/hooks/use-combos';
import {
  blankComboRuleValues,
  ComboCoveragePreviewSection,
  comboRuleBodyFromValues,
  comboRuleSchema,
  ComboRuleFormFields,
  type ComboRuleFormValues,
} from '../combo-rule-form';

export default function NewComboRulePage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();
  const create = useCreateComboRule();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ComboRuleFormValues>({ resolver: zodResolver(comboRuleSchema), defaultValues: blankComboRuleValues });

  const busy = create.isPending;

  const onSubmit = async (form: ComboRuleFormValues) => {
    setError(null);
    try {
      await create.mutateAsync(comboRuleBodyFromValues(form));
      router.push(`/${locale}/admin/combos`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('New combo rule', 'قاعدة تجميع جديدة')}</h1>
        <Link href={`/${locale}/admin/combos`} className="btn btn--ghost">
          {t('Cancel', 'إلغاء')}
        </Link>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="admin-form">
        <ComboRuleFormFields register={register} control={control} errors={errors} busy={busy} locale={locale} />
        <ComboCoveragePreviewSection getValues={getValues} locale={locale} />

        {error && (
          <Alert tone="danger" className="stack">
            {error}
          </Alert>
        )}

        <div className="admin-form__actions">
          <Button type="submit" loading={busy}>
            {t('Add combo rule', 'إضافة قاعدة التجميع')}
          </Button>
        </div>
      </form>
    </div>
  );
}
