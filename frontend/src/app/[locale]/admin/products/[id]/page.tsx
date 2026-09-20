'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, RotateCcw, Trash2 } from 'lucide-react';
import { Alert, Button, ConfirmModal, EmptyState, Icon, ProductGridSkeleton } from '@/components/ui';
import { ImageGallery } from '@/components/admin/image-gallery';
import { isApiError } from '@/lib/api';
import {
  useAddProductImage,
  useDeleteProduct,
  useDeleteProductImage,
  usePermanentDeleteProduct,
  useProduct,
  useRestoreProduct,
  useUpdateProduct,
  useUpdateProductImage,
} from '@/hooks/use-catalog';
import { ProductCoreFields, productCoreSchema, type ProductCoreValues } from '../product-form';
import { VariantsManager } from './variants-manager';

export default function EditProductPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const id = typeof params?.id === 'string' ? params.id : '';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();

  const { data: product, isPending, isError, refetch } = useProduct(id);
  const updateProduct = useUpdateProduct();
  const archiveProduct = useDeleteProduct();
  const restoreProduct = useRestoreProduct();
  const permanentDeleteProduct = usePermanentDeleteProduct();
  const addImage = useAddProductImage();
  const updateImage = useUpdateProductImage();
  const deleteImage = useDeleteProductImage();

  const [error, setError] = useState<string | null>(null);
  const [deleteImageId, setDeleteImageId] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductCoreValues>({
    resolver: zodResolver(productCoreSchema),
    values: product
      ? {
          sku: product.sku,
          nameEn: product.nameEn,
          nameAr: product.nameAr,
          descriptionEn: product.descriptionEn ?? '',
          descriptionAr: product.descriptionAr ?? '',
          primaryCategoryId: product.primaryCategoryID,
          additionalCategoryIds: (product.categoryLinks ?? []).map((l) => l.categoryID),
          collectionIds: (product.collectionLinks ?? []).map((l) => l.collectionID),
          price: Number(product.price),
          saleType: product.saleType ?? '',
          saleValue: product.saleValue != null ? String(product.saleValue) : '',
          isRestocked: product.isRestocked,
        }
      : undefined,
  });

  const busy = updateProduct.isPending;

  const onSubmit = async (values: ProductCoreValues) => {
    setError(null);
    try {
      await updateProduct.mutateAsync({
        id,
        body: {
          sku: values.sku,
          nameEn: values.nameEn,
          nameAr: values.nameAr,
          descriptionEn: values.descriptionEn || undefined,
          descriptionAr: values.descriptionAr || undefined,
          primaryCategoryId: values.primaryCategoryId,
          additionalCategoryIds: values.additionalCategoryIds,
          collectionIds: values.collectionIds,
          price: values.price,
          saleType: values.saleType || null,
          saleValue: values.saleValue ? Number(values.saleValue) : null,
          isRestocked: values.isRestocked,
          // Optimistic-concurrency guard (fix-list.md #14, resolves 1.5) —
          // the server rejects this write if `lastEdit` no longer matches,
          // instead of silently overwriting whatever another admin just
          // saved. `product` is always defined here (the form isn't
          // rendered until it's loaded — see the isPending guard below).
          expectedLastEdit: product?.lastEdit,
        },
      });
    } catch (e) {
      // STALE_WRITE is a genuine optimistic-concurrency loss — `lastEdit`
      // moved under us, so whatever we're about to show is already stale.
      // It's a distinct code from the backend's generic CONFLICT (e.g. "that
      // category is archived") specifically so this refresh flow only fires
      // for a real race, not for every 409 (fix-list.md's category/version
      // conflation bug) — anything else falls through to the plain
      // `e.message` branch below, which shows the backend's actual reason.
      if (isApiError(e) && e.code === 'STALE_WRITE') {
        // The form's `values` are wired to `product` (below), so refetching
        // pulls in whatever the other admin just saved — this edit is lost,
        // same as it would be for two people editing the same document
        // anywhere else, but at least it's visible instead of silent.
        void refetch();
        setError(
          t(
            'Someone else changed this product while you were editing. The form now shows their version — review and re-apply your change if still needed.',
            'قام شخص آخر بتغيير هذا المنتج أثناء تعديلك. يعرض النموذج الآن نسختهم — راجع وأعد تطبيق تغييرك إذا لزم الأمر.'
          )
        );
        return;
      }
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  // Three distinct actions, matching the list page (admin/products/page.tsx)
  // — see the identical comment in admin/collections/[id]/page.tsx
  // (fix-list.md #15, resolves 12.8).
  const [confirmKind, setConfirmKind] = useState<'archive' | 'delete' | null>(null);

  const doArchiveProduct = async () => {
    try {
      await archiveProduct.mutateAsync(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Archive failed', 'فشلت الأرشفة'));
    } finally {
      setConfirmKind(null);
    }
  };

  const onRestoreProduct = async () => {
    try {
      await restoreProduct.mutateAsync(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Restore failed', 'فشلت الاستعادة'));
    }
  };

  const doPermanentDeleteProduct = async () => {
    try {
      await permanentDeleteProduct.mutateAsync(id);
      router.push(`/${locale}/admin/products`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Delete failed', 'فشل الحذف'));
      setConfirmKind(null);
    }
  };

  const productName = product ? (isAr ? product.nameAr : product.nameEn) : '';

  if (isPending) {
    return (
      <div className="section--tight">
        <ProductGridSkeleton count={1} />
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="section--tight">
        <EmptyState
          tone="alert"
          title={t("Couldn't load this product", 'تعذّر تحميل هذا المنتج')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      </div>
    );
  }

  // Distinct colours already in use, so the image gallery's per-image colour
  // picker offers the same options an admin just typed into the variants below.
  const colorOptions = Array.from(new Set(product.variants.map((v) => v.color).filter((c): c is string => !!c)));

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{isAr ? product.nameAr : product.nameEn}</h1>
        <span className="admin-row-actions">
          {product.deletedAt ? (
            <>
              <Button variant="outline" onClick={onRestoreProduct} loading={restoreProduct.isPending}>
                <Icon as={RotateCcw} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
                {t('Restore', 'استعادة')}
              </Button>
              <Button variant="danger" onClick={() => setConfirmKind('delete')} loading={permanentDeleteProduct.isPending}>
                <Icon as={Trash2} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
                {t('Delete permanently', 'حذف نهائي')}
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmKind('archive')} loading={archiveProduct.isPending}>
              <Icon as={Archive} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
              {t('Archive product', 'أرشفة المنتج')}
            </Button>
          )}
        </span>
      </div>

      <ConfirmModal
        open={confirmKind !== null}
        onClose={() => setConfirmKind(null)}
        onConfirm={() => void (confirmKind === 'archive' ? doArchiveProduct() : doPermanentDeleteProduct())}
        title={
          confirmKind === 'archive'
            ? t(`Archive "${productName}"?`, `أرشفة "${productName}"؟`)
            : t(`Permanently delete "${productName}"?`, `حذف "${productName}" نهائيًا؟`)
        }
        body={
          confirmKind === 'archive'
            ? t('It will be hidden from the storefront but kept.', 'سيُخفى من المتجر مع الاحتفاظ به.')
            : t('This cannot be undone.', 'لا يمكن التراجع عن هذا.')
        }
        confirmLabel={confirmKind === 'archive' ? t('Archive', 'أرشفة') : t('Delete', 'حذف')}
        cancelLabel={t('Cancel', 'إلغاء')}
        tone={confirmKind === 'delete' ? 'danger' : 'default'}
        loading={confirmKind === 'archive' ? archiveProduct.isPending : permanentDeleteProduct.isPending}
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="admin-form">
        <ProductCoreFields register={register} control={control} errors={errors} busy={busy} locale={locale} isEditing />

        {product.promotion && (
          <Alert tone="info">
            {t(
              `"${product.promotion.nameEn}" is currently applied to this product: ${
                product.promotion.type === 'PERCENT' ? `${product.promotion.value}%` : `$${product.promotion.value}`
              } off.`,
              `يُطبَّق حاليًا على هذا المنتج ترويج «${product.promotion.nameAr}»: خصم ${
                product.promotion.type === 'PERCENT' ? `${product.promotion.value}%` : `${product.promotion.value}$`
              }.`
            )}{' '}
            {product.promotion.source === 'COLLECTION' &&
              t(
                `Applied via the collection "${product.promotion.sourceNameEn}".`,
                `يُطبَّق عبر مجموعة «${product.promotion.sourceNameAr}».`
              )}
            {product.promotion.source === 'CATEGORY' &&
              t(
                `Applied via the category "${product.promotion.sourceNameEn}".`,
                `يُطبَّق عبر فئة «${product.promotion.sourceNameAr}».`
              )}
            {product.promotion.source === 'ALL' && t('Applied site-wide (all products).', 'يُطبَّق على كل المنتجات.')}
            {product.promotion.source === 'PRODUCT' &&
              t('Applied directly to this product.', 'يُطبَّق مباشرةً على هذا المنتج.')}{' '}
            {product.promotion.stackable
              ? t('It stacks on top of the sale set above.', 'يُضاف فوق التخفيض المحدَّد أعلاه.')
              : t(
                  'It replaces the sale set above (applied to the original price instead).',
                  'يحلّ محل التخفيض المحدَّد أعلاه (يُطبَّق على السعر الأصلي بدلاً منه).'
                )}
          </Alert>
        )}

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="admin-form__actions">
          <Button type="submit" loading={busy}>
            {t('Save changes', 'حفظ التغييرات')}
          </Button>
        </div>
      </form>

      <VariantsManager productId={id} variants={product.variants} locale={locale} />

      <div className="admin-form" style={{ marginTop: 'var(--space-7)' }}>
        <p className="admin-form__section-title">{t('Images', 'الصور')}</p>
        <ImageGallery
          images={product.images}
          colorOptions={colorOptions}
          folder="/products"
          locale={locale}
          onAdd={(img) => addImage.mutate({ id, body: { url: img.url, fileId: img.fileId } })}
          onColorChange={(imageId, color) => updateImage.mutate({ id, imageId, body: { color } })}
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
