'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCreateCollection } from '@/hooks/use-catalog';
import { CollectionForm, collectionFormDefaults, type CollectionFormValues } from '../collection-form';

export default function NewCollectionPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const router = useRouter();
  const createCollection = useCreateCollection();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (values: CollectionFormValues) => {
    setError(null);
    try {
      const created = await createCollection.mutateAsync({
        nameEn: values.nameEn,
        nameAr: values.nameAr,
        slug: values.slug,
        descriptionEn: values.descriptionEn || undefined,
        descriptionAr: values.descriptionAr || undefined,
        isActive: values.isActive,
        showInNav: values.showInNav,
        showOnHome: values.showOnHome,
        showOnHomeAsImage: values.showOnHomeAsImage,
        sortOrder: values.sortOrder,
        homeSortOrder: values.homeSortOrder,
        accentColor: values.accentColor || undefined,
        homeImageCtaEn: values.homeImageCtaEn || undefined,
        homeImageCtaAr: values.homeImageCtaAr || undefined,
      });
      // Images can only be attached once the collection exists.
      router.push(`/${locale}/admin/collections/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : isAr ? 'فشل الإنشاء' : 'Create failed');
    }
  };

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{isAr ? 'مجموعة جديدة' : 'New collection'}</h1>
      </div>
      <CollectionForm
        locale={locale}
        defaultValues={collectionFormDefaults}
        onSubmit={onSubmit}
        submitLabel={isAr ? 'إنشاء' : 'Create'}
        isSubmitting={createCollection.isPending}
        submitError={error}
      />
    </div>
  );
}
