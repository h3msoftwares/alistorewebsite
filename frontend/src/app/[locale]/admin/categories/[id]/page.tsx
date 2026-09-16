'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Archive, RotateCcw, Trash2 } from 'lucide-react';
import { Button, ConfirmModal, EmptyState, Icon, ProductGridSkeleton } from '@/components/ui';
import { ImageGallery } from '@/components/admin/image-gallery';
import {
  useAddCategoryImage,
  useCategory,
  useDeleteCategory,
  useDeleteCategoryImage,
  usePermanentDeleteCategory,
  useRestoreCategory,
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
  const archiveCategory = useDeleteCategory();
  const restoreCategory = useRestoreCategory();
  const permanentDeleteCategory = usePermanentDeleteCategory();
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
          parentId: values.parentId || null,
          isActive: values.isActive,
          showOnHome: values.showOnHome,
          sortOrder: values.sortOrder,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  // Three distinct actions, matching the list page (admin/categories/page.tsx)
  // — see the identical comment in admin/collections/[id]/page.tsx
  // (fix-list.md #15, resolves 12.8).
  const [confirmKind, setConfirmKind] = useState<'archive' | 'delete' | null>(null);

  const doArchiveCategory = async () => {
    try {
      await archiveCategory.mutateAsync(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Archive failed', 'فشلت الأرشفة'));
    } finally {
      setConfirmKind(null);
    }
  };

  const onRestoreCategory = async () => {
    try {
      await restoreCategory.mutateAsync(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Restore failed', 'فشلت الاستعادة'));
    }
  };

  const doPermanentDeleteCategory = async () => {
    try {
      await permanentDeleteCategory.mutateAsync(id);
      router.push(`/${locale}/admin/categories`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Delete failed', 'فشل الحذف'));
      setConfirmKind(null);
    }
  };

  const categoryName = category ? (isAr ? category.nameAr : category.nameEn) : '';

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
        <span className="admin-row-actions">
          {category.archivedAt ? (
            <>
              <Button variant="outline" onClick={onRestoreCategory} loading={restoreCategory.isPending}>
                <Icon as={RotateCcw} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
                {t('Restore', 'استعادة')}
              </Button>
              <Button variant="danger" onClick={() => setConfirmKind('delete')} loading={permanentDeleteCategory.isPending}>
                <Icon as={Trash2} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
                {t('Delete permanently', 'حذف نهائي')}
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmKind('archive')} loading={archiveCategory.isPending}>
              <Icon as={Archive} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
              {t('Archive category', 'أرشفة الفئة')}
            </Button>
          )}
        </span>
      </div>

      <ConfirmModal
        open={confirmKind !== null}
        onClose={() => setConfirmKind(null)}
        onConfirm={() => void (confirmKind === 'archive' ? doArchiveCategory() : doPermanentDeleteCategory())}
        title={
          confirmKind === 'archive'
            ? t(`Archive "${categoryName}"?`, `أرشفة "${categoryName}"؟`)
            : t(`Permanently delete "${categoryName}"?`, `حذف "${categoryName}" نهائيًا؟`)
        }
        body={
          confirmKind === 'archive'
            ? t('It will be hidden from the storefront but kept.', 'ستُخفى من المتجر مع الاحتفاظ بها.')
            : t('This cannot be undone.', 'لا يمكن التراجع عن هذا.')
        }
        confirmLabel={confirmKind === 'archive' ? t('Archive', 'أرشفة') : t('Delete', 'حذف')}
        cancelLabel={t('Cancel', 'إلغاء')}
        tone={confirmKind === 'delete' ? 'danger' : 'default'}
        loading={confirmKind === 'archive' ? archiveCategory.isPending : permanentDeleteCategory.isPending}
      />

      <CategoryForm
        locale={locale}
        editingId={id}
        defaultValues={{
          nameEn: category.nameEn,
          nameAr: category.nameAr,
          slug: category.slug,
          parentId: category.parentID ?? '',
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
