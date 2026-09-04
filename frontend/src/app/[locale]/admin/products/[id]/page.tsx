'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, EmptyState, ProductGridSkeleton } from '@/components/ui';
import { ImageGallery } from '@/components/admin/image-gallery';
import {
  useAddProductImage,
  useDeleteProduct,
  useDeleteProductImage,
  useProduct,
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
  const deleteProduct = useDeleteProduct();
  const addImage = useAddProductImage();
  const updateImage = useUpdateProductImage();
  const deleteImage = useDeleteProductImage();

  const [error, setError] = useState<string | null>(null);
  const [deleteImageId, setDeleteImageId] = useState<string | null>(null);

  const {
    register,
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
          categoryId: product.categoryID,
          price: Number(product.price),
          compareAtPrice: product.compareAtPrice != null ? String(product.compareAtPrice) : '',
          quantity: product.quantity,
          saleType: product.saleType ?? '',
          saleValue: product.saleValue != null ? String(product.saleValue) : '',
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
          categoryId: values.categoryId,
          price: values.price,
          compareAtPrice: values.compareAtPrice ? Number(values.compareAtPrice) : undefined,
          quantity: values.quantity,
          saleType: values.saleType || null,
          saleValue: values.saleValue ? Number(values.saleValue) : null,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  const onDeleteProduct = async () => {
    if (!product) return;
    const name = isAr ? product.nameAr : product.nameEn;
    if (!window.confirm(t(`Delete "${name}"? This can't be undone.`, `حذف "${name}"؟ لا يمكن التراجع عن هذا.`))) return;
    try {
      await deleteProduct.mutateAsync(id);
      router.push(`/${locale}/admin/products`);
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
        <Button variant="danger" onClick={onDeleteProduct} loading={deleteProduct.isPending}>
          {t('Delete product', 'حذف المنتج')}
        </Button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="admin-form">
        <ProductCoreFields register={register} errors={errors} busy={busy} locale={locale} />

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
          onAdd={(url) => addImage.mutate({ id, body: { url } })}
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
