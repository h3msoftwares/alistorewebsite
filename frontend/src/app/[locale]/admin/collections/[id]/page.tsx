'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Archive, RotateCcw, Trash2 } from 'lucide-react';
import { Button, EmptyState, Icon, ProductGridSkeleton } from '@/components/ui';
import { ImageGallery } from '@/components/admin/image-gallery';
import {
  useAddCollectionImage,
  useCollection,
  useDeleteCollection,
  useDeleteCollectionImage,
  usePermanentDeleteCollection,
  useRestoreCollection,
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
  const archiveCollection = useDeleteCollection();
  const restoreCollection = useRestoreCollection();
  const permanentDeleteCollection = usePermanentDeleteCollection();
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
          showOnHomeAsImage: values.showOnHomeAsImage,
          sortOrder: values.sortOrder,
          homeSortOrder: values.homeSortOrder,
          accentColor: values.accentColor ? values.accentColor : null,
          homeImageCtaEn: values.homeImageCtaEn || null,
          homeImageCtaAr: values.homeImageCtaAr || null,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  // Three distinct actions, matching the list page's (admin/collections/page.tsx)
  // — a single "Delete" button here used to call the archive-only mutation
  // while claiming "This can't be undone", the opposite of what actually
  // happened (fix-list.md #15, resolves 12.8). Archive/Restore stay on this
  // page (the mutations invalidate the collection-detail query, so the
  // header re-renders with the new state); only the real permanent delete
  // navigates away, since the collection no longer exists afterward.
  const onArchiveCollection = async () => {
    if (!collection) return;
    const name = isAr ? collection.nameAr : collection.nameEn;
    if (
      !window.confirm(
        t(
          `Archive "${name}"? It will be hidden from the storefront but kept.`,
          `أرشفة "${name}"؟ ستُخفى من المتجر مع الاحتفاظ بها.`
        )
      )
    )
      return;
    try {
      await archiveCollection.mutateAsync(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Archive failed', 'فشلت الأرشفة'));
    }
  };

  const onRestoreCollection = async () => {
    try {
      await restoreCollection.mutateAsync(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Restore failed', 'فشلت الاستعادة'));
    }
  };

  const onPermanentDeleteCollection = async () => {
    if (!collection) return;
    const name = isAr ? collection.nameAr : collection.nameEn;
    if (!window.confirm(t(`Permanently delete "${name}"? This cannot be undone.`, `حذف "${name}" نهائيًا؟ لا يمكن التراجع.`))) return;
    try {
      await permanentDeleteCollection.mutateAsync(id);
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
        <span className="admin-row-actions">
          {collection.archivedAt ? (
            <>
              <Button variant="outline" onClick={onRestoreCollection} loading={restoreCollection.isPending}>
                <Icon as={RotateCcw} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
                {t('Restore', 'استعادة')}
              </Button>
              <Button variant="danger" onClick={onPermanentDeleteCollection} loading={permanentDeleteCollection.isPending}>
                <Icon as={Trash2} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
                {t('Delete permanently', 'حذف نهائي')}
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={onArchiveCollection} loading={archiveCollection.isPending}>
              <Icon as={Archive} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
              {t('Archive collection', 'أرشفة المجموعة')}
            </Button>
          )}
        </span>
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
          showOnHomeAsImage: collection.showOnHomeAsImage,
          sortOrder: collection.sortOrder,
          homeSortOrder: collection.homeSortOrder,
          accentColor: collection.accentColor ?? '',
          homeImageCtaEn: collection.homeImageCtaEn ?? '',
          homeImageCtaAr: collection.homeImageCtaAr ?? '',
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
