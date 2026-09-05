'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, EmptyState, ProductGridSkeleton } from '@/components/ui';
import { ImageGallery } from '@/components/admin/image-gallery';
import {
  useAddCollectionImage,
  useCollection,
  useDeleteCollection,
  useDeleteCollectionImage,
  useUpdateCollection,
} from '@/hooks/use-catalog';
import { CollectionForm, type CollectionFormValues } from '../collection-form';

export default function EditCollectionPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const id = typeof params?.id === 'string' ? params.id : '';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();

  const { data: collection, isPending, isError, refetch } = useCollection(id);
  const updateCollection = useUpdateCollection();
  const deleteCollection = useDeleteCollection();
  const addImage = useAddCollectionImage();
  const deleteImage = useDeleteCollectionImage();

  const [error, setError] = useState<string | null>(null);
  const [deleteImageId, setDeleteImageId] = useState<string | null>(null);

  const onSubmit = async (values: CollectionFormValues) => {
    setError(null);
    try {
      await updateCollection.mutateAsync({
        id,
        body: {
          nameEn: values.nameEn,
          nameAr: values.nameAr,
          slug: values.slug,
          descriptionEn: values.descriptionEn || undefined,
          descriptionAr: values.descriptionAr || undefined,
          isActive: values.isActive,
          showInNav: values.showInNav,
          showOnHome: values.showOnHome,
          sortOrder: values.sortOrder,
          accentColor: values.accentColor ? values.accentColor : null,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  const onDeleteCollection = async () => {
    if (!collection) return;
    const name = isAr ? collection.nameAr : collection.nameEn;
    if (!window.confirm(t(`Delete "${name}"? This can't be undone.`, `حذف "${name}"؟ لا يمكن التراجع عن هذا.`))) return;
    try {
      await deleteCollection.mutateAsync(id);
      router.push(`/${locale}/admin/collections`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Delete failed', 'فشل الحذف'));
    }
  };

  if (isPending) {
    return (
      <div className="section--tight">
        <ProductGridSkeleton count={1} />
      </div>
    );
  }

  if (isError || !collection) {
    return (
      <div className="section--tight">
        <EmptyState
          tone="alert"
          title={t("Couldn't load this collection", 'تعذّر تحميل هذه المجموعة')}
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
        <h1>{isAr ? collection.nameAr : collection.nameEn}</h1>
        <Button variant="danger" onClick={onDeleteCollection} loading={deleteCollection.isPending}>
          {t('Delete collection', 'حذف المجموعة')}
        </Button>
      </div>

      <CollectionForm
        locale={locale}
        defaultValues={{
          nameEn: collection.nameEn,
          nameAr: collection.nameAr,
          slug: collection.slug,
          descriptionEn: collection.descriptionEn ?? '',
          descriptionAr: collection.descriptionAr ?? '',
          isActive: collection.isActive,
          showInNav: collection.showInNav,
          showOnHome: collection.showOnHome,
          sortOrder: collection.sortOrder,
          accentColor: collection.accentColor ?? '',
        }}
        onSubmit={onSubmit}
        submitLabel={t('Save changes', 'حفظ التغييرات')}
        isSubmitting={updateCollection.isPending}
        submitError={error}
      />

      <div className="admin-form" style={{ marginTop: 'var(--space-7)' }}>
        <p className="admin-form__section-title">{t('Images', 'الصور')}</p>
        <ImageGallery
          images={collection.images}
          folder="/collections"
          locale={locale}
          onAdd={(img) => addImage.mutate({ id, body: { url: img.url, fileId: img.fileId } })}
          onDelete={(imageId) => {
            setDeleteImageId(imageId);
            deleteImage.mutate(
              { id, imageId },
              { onSettled: () => setDeleteImageId(null) }
            );
          }}
          isDeleting={(imageId) => deleteImageId === imageId && deleteImage.isPending}
        />
      </div>
    </div>
  );
}
