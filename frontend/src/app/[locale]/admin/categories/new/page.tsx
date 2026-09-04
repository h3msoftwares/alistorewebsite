'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCreateCategory } from '@/hooks/use-catalog';
import { CategoryForm, categoryFormDefaults, type CategoryFormValues } from '../category-form';

export default function NewCategoryPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const router = useRouter();
  const createCategory = useCreateCategory();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (values: CategoryFormValues) => {
    setError(null);
    try {
      const created = await createCategory.mutateAsync({
        nameEn: values.nameEn,
        nameAr: values.nameAr,
        slug: values.slug,
        collectionId: values.collectionId || null,
        isActive: values.isActive,
        showOnHome: values.showOnHome,
        sortOrder: values.sortOrder,
      });
      // Images can only be attached once the category exists.
      router.push(`/${locale}/admin/categories/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : isAr ? 'فشل الإنشاء' : 'Create failed');
    }
  };

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{isAr ? 'فئة جديدة' : 'New category'}</h1>
      </div>
      <CategoryForm
        locale={locale}
        defaultValues={categoryFormDefaults}
        onSubmit={onSubmit}
        submitLabel={isAr ? 'إنشاء' : 'Create'}
        isSubmitting={createCategory.isPending}
        submitError={error}
      />
    </div>
  );
}
