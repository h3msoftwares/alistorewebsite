'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, DataTable, EmptyState, Icon, ProductGridSkeleton } from '@/components/ui';
import { AdminThumb } from '@/components/admin/admin-thumb';
import { useDeleteProduct, useProducts } from '@/hooks/use-catalog';

export default function AdminProductsPage() {
  const params = useParams();
  const locale = (typeof params?.locale === 'string' ? params.locale : 'en') || 'en';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  // TODO(admin-products): add real pagination controls once the catalog
  // grows past the API's 60-item page cap — for now the admin just sees the
  // first page, same ceiling as the storefront's largest grid.
  const { data, isPending, isError, refetch } = useProducts({ pageSize: 60 });
  const products = data?.items ?? [];
  const deleteProduct = useDeleteProduct();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(t(`Delete "${name}"? This can't be undone.`, `حذف "${name}"؟ لا يمكن التراجع عن هذا.`))) return;
    setDeleteError(null);
    setPendingDeleteId(id);
    try {
      await deleteProduct.mutateAsync(id);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : t('Delete failed', 'فشل الحذف'));
    } finally {
      setPendingDeleteId(null);
    }
  };

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Products', 'المنتجات')}</h1>
        <Link href={`/${locale}/admin/products/new`} className="btn btn--primary">
          <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
          {t('New product', 'منتج جديد')}
        </Link>
      </div>

      {deleteError && (
        <Alert tone="danger" className="stack">
          {deleteError}
        </Alert>
      )}

      {isPending ? (
        <ProductGridSkeleton count={4} />
      ) : isError ? (
        <EmptyState
          tone="alert"
          title={t("Couldn't load products", 'تعذّر تحميل المنتجات')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      ) : products.length === 0 ? (
        <EmptyState
          title={t('No products yet', 'لا توجد منتجات بعد')}
          action={
            <Link href={`/${locale}/admin/products/new`} className="btn btn--primary">
              {t('New product', 'منتج جديد')}
            </Link>
          }
        />
      ) : (
        <DataTable responsive>
          <thead>
            <tr>
              <th aria-hidden="true" />
              <th>{t('Name', 'الاسم')}</th>
              <th>{t('SKU', 'رمز المنتج')}</th>
              <th>{t('Category', 'الفئة')}</th>
              <th>{t('Price', 'السعر')}</th>
              <th>{t('Quantity', 'الكمية')}</th>
              <th>{t('Status', 'الحالة')}</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td data-label={t('Image', 'الصورة')}>
                  <AdminThumb url={p.images[0]?.url} alt={isAr ? p.nameAr : p.nameEn} />
                </td>
                <td data-label={t('Name', 'الاسم')}>
                  <Link href={`/${locale}/admin/products/${p.id}`}>{isAr ? p.nameAr : p.nameEn}</Link>
                </td>
                <td data-label={t('SKU', 'رمز المنتج')}>{p.sku}</td>
                <td data-label={t('Category', 'الفئة')}>
                  {p.category ? (isAr ? p.category.nameAr : p.category.nameEn) : '—'}
                </td>
                <td data-label={t('Price', 'السعر')}>
                  {p.onSale ? (
                    <>
                      <span style={{ textDecoration: 'line-through', color: 'var(--color-text-muted)' }}>{String(p.price)}</span>{' '}
                      {p.effectivePrice}
                    </>
                  ) : (
                    String(p.price)
                  )}
                </td>
                <td data-label={t('Quantity', 'الكمية')}>{p.quantity}</td>
                <td data-label={t('Status', 'الحالة')}>
                  {p.isActive ? (
                    <Badge variant="new">{t('Active', 'مفعّل')}</Badge>
                  ) : (
                    <Badge variant="low-stock">{t('Hidden', 'مخفي')}</Badge>
                  )}
                </td>
                <td data-label={t('Actions', 'إجراءات')}>
                  <button
                    type="button"
                    className="icon-btn icon-btn--bordered"
                    onClick={() => handleDelete(p.id, isAr ? p.nameAr : p.nameEn)}
                    disabled={pendingDeleteId === p.id}
                    aria-label={t('Delete', 'حذف')}
                  >
                    <Icon as={Trash2} size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
