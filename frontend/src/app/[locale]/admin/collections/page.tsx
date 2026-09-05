'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, DataTable, EmptyState, Icon, ProductGridSkeleton } from '@/components/ui';
import { AdminThumb } from '@/components/admin/admin-thumb';
import { useCollections, useDeleteCollection } from '@/hooks/use-catalog';

export default function AdminCollectionsPage() {
  const params = useParams();
  const locale = (typeof params?.locale === 'string' ? params.locale : 'en') || 'en';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { data: collections, isPending, isError, refetch } = useCollections({ includeInactive: true });
  const deleteCollection = useDeleteCollection();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(t(`Delete "${name}"? This can't be undone.`, `حذف "${name}"؟ لا يمكن التراجع عن هذا.`))) return;
    setDeleteError(null);
    setPendingDeleteId(id);
    try {
      await deleteCollection.mutateAsync(id);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : t('Delete failed', 'فشل الحذف'));
    } finally {
      setPendingDeleteId(null);
    }
  };

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Collections', 'المجموعات')}</h1>
        <Link href={`/${locale}/admin/collections/new`} className="btn btn--primary">
          <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
          {t('New collection', 'مجموعة جديدة')}
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
          title={t("Couldn't load collections", 'تعذّر تحميل المجموعات')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      ) : !collections || collections.length === 0 ? (
        <EmptyState
          title={t('No collections yet', 'لا توجد مجموعات بعد')}
          action={
            <Link href={`/${locale}/admin/collections/new`} className="btn btn--primary">
              {t('New collection', 'مجموعة جديدة')}
            </Link>
          }
        />
      ) : (
        <DataTable responsive>
          <thead>
            <tr>
              <th aria-hidden="true" />
              <th>{t('Name', 'الاسم')}</th>
              <th>{t('Slug', 'الرابط')}</th>
              <th>{t('Status', 'الحالة')}</th>
              <th>{t('Nav', 'التنقل')}</th>
              <th>{t('Home', 'الرئيسية')}</th>
              <th className="is-numeric">{t('Categories', 'الفئات')}</th>
              <th className="is-numeric">{t('Products', 'المنتجات')}</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {collections.map((c) => (
              <tr key={c.id}>
                <td data-label={t('Image', 'الصورة')}>
                  <AdminThumb url={c.images[0]?.url} alt={isAr ? c.nameAr : c.nameEn} />
                </td>
                <td data-label={t('Name', 'الاسم')}>
                  <Link href={`/${locale}/admin/collections/${c.id}`}>{isAr ? c.nameAr : c.nameEn}</Link>
                </td>
                <td data-label={t('Slug', 'الرابط')}>{c.slug}</td>
                <td data-label={t('Status', 'الحالة')}>
                  {c.isActive ? (
                    <Badge variant="new">{t('Active', 'مفعّل')}</Badge>
                  ) : (
                    <Badge variant="low-stock">{t('Hidden', 'مخفي')}</Badge>
                  )}
                </td>
                <td data-label={t('Nav', 'التنقل')}>{c.showInNav ? t('Yes', 'نعم') : '—'}</td>
                <td data-label={t('Home', 'الرئيسية')}>{c.showOnHome ? t('Yes', 'نعم') : '—'}</td>
                <td className="is-numeric" data-label={t('Categories', 'الفئات')}>
                  {c._count?.categories ?? 0}
                </td>
                <td className="is-numeric" data-label={t('Products', 'المنتجات')}>
                  {c._count?.products ?? 0}
                </td>
                <td data-label={t('Actions', 'إجراءات')}>
                  <button
                    type="button"
                    className="icon-btn icon-btn--bordered"
                    onClick={() => handleDelete(c.id, isAr ? c.nameAr : c.nameEn)}
                    disabled={pendingDeleteId === c.id}
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
