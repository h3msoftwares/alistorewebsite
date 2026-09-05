'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, EmptyState, ProductGridSkeleton } from '@/components/ui';
import { ImageGallery } from '@/components/admin/image-gallery';
import {
  useAddCategoryImage,
  useCategory,
  useDeleteCategory,
  useDeleteCategoryImage,
  useUpdateCategory,
} from '@/hooks/use-catalog';
import { CategoryForm, type CategoryFormValues } from '../category-form';

export default function EditCategoryPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const id = typeof params?.id === 'string' ? params.id : '';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();

  const { data: category, isPending, isError, refetch } = useCategory(id);
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const addImage = useAddCategoryImage();
  const deleteImage = useDeleteCategoryImage();

  const [error, setError] = useState<string | null>(null);
  const [deleteImageId, setDeleteImageId] = useState<string | null>(null);

  const onSubmit = async (values: CategoryFormValues) => {
    setError(null);
    try {
      await updateCategory.mutateAsync({
        id,
        body: {
          nameEn: values.nameEn,
          nameAr: values.nameAr,
          slug: values.slug,
          collectionId: values.collectionId || null,
          isActive: values.isActive,
          showOnHome: values.showOnHome,
          sortOrder: values.sortOrder,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  const onDeleteCategory = async () => {
    if (!category) return;
    const name = isAr ? category.nameAr : category.nameEn;
    if (!window.confirm(t(`Delete "${name}"? This can't be undone.`, `حذف "${name}"؟ لا يمكن التراجع عن هذا.`))) return;
    try {
      await deleteCategory.mutateAsync(id);
      router.push(`/${locale}/admin/categories`);
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

  if (isError || !category) {
    return (
      <div className="section--tight">
        <EmptyState
          tone="alert"
          title={t("Couldn't load this category", 'تعذّر تحميل هذه الفئة')}
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
        <h1>{isAr ? category.nameAr : category.nameEn}</h1>
        <Button variant="danger" onClick={onDeleteCategory} loading={deleteCategory.isPending}>
          {t('Delete category', 'حذف الفئة')}
        </Button>
      </div>

      <CategoryForm
        locale={locale}
        defaultValues={{
          nameEn: category.nameEn,
          nameAr: category.nameAr,
          slug: category.slug,
          collectionId: category.collectionID ?? '',
          isActive: category.isActive,
          showOnHome: category.showOnHome,
          sortOrder: category.sortOrder,
        }}
        onSubmit={onSubmit}
        submitLabel={t('Save changes', 'حفظ التغييرات')}
        isSubmitting={updateCategory.isPending}
        submitError={error}
      />

      <div className="admin-form" style={{ marginTop: 'var(--space-7)' }}>
        <p className="admin-form__section-title">{t('Images', 'الصور')}</p>
        <ImageGallery
          images={category.images}
          folder="/categories"
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
