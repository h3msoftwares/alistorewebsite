'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, DataTable, EmptyState, Icon, ProductGridSkeleton } from '@/components/ui';
import { AdminThumb } from '@/components/admin/admin-thumb';
import { AdminListControls } from '@/components/admin/admin-list-controls';
import { AdminPager } from '@/components/admin/admin-pager';
import {
  useAdminCollections,
  useDeleteCollection,
  usePermanentDeleteCollection,
  useRestoreCollection,
} from '@/hooks/use-catalog';
import type { CatalogStatus, Collection } from '@/lib/types';

const PAGE_SIZE = 20;

export default function AdminCollectionsPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CatalogStatus>('active');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useAdminCollections({
    search: search || undefined,
    status,
  });
  const archive = useDeleteCollection();
  const restore = useRestoreCollection();
  const permanentDelete = usePermanentDeleteCollection();

  const rows = data ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => (data ?? []).slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [data, safePage]
  );

  const name = (c: Collection) => (isAr ? c.nameAr : c.nameEn);

  const runAction = async (id: string, fn: () => Promise<unknown>, failMsg: string) => {
    setActionError(null);
    setBusyId(id);
    try {
      await fn();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : failMsg);
    } finally {
      setBusyId(null);
    }
  };

  const onArchive = (c: Collection) => {
    if (!window.confirm(t(`Archive "${name(c)}"? It will be hidden from the storefront but kept.`, `أرشفة "${name(c)}"؟ ستُخفى من المتجر مع الاحتفاظ بها.`))) return;
    void runAction(c.id, () => archive.mutateAsync(c.id), t('Archive failed', 'فشلت الأرشفة'));
  };
  const onRestore = (c: Collection) =>
    void runAction(c.id, () => restore.mutateAsync(c.id), t('Restore failed', 'فشلت الاستعادة'));
  const onPermanentDelete = (c: Collection) => {
    if (!window.confirm(t(`Permanently delete "${name(c)}"? This cannot be undone.`, `حذف "${name(c)}" نهائيًا؟ لا يمكن التراجع.`))) return;
    void runAction(c.id, () => permanentDelete.mutateAsync(c.id), t('Delete failed', 'فشل الحذف'));
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

      <AdminListControls
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        status={status}
        onStatusChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        locale={locale}
      />

      {actionError && <Alert tone="danger" className="stack">{actionError}</Alert>}

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
      ) : rows.length === 0 ? (
        <EmptyState
          title={search || status !== 'active' ? t('No matches', 'لا نتائج') : t('No collections yet', 'لا توجد مجموعات بعد')}
          action={
            <Link href={`/${locale}/admin/collections/new`} className="btn btn--primary">
              {t('New collection', 'مجموعة جديدة')}
            </Link>
          }
        />
      ) : (
        <>
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
              {pageRows.map((c) => (
                <tr key={c.id}>
                  <td data-label={t('Image', 'الصورة')}>
                    <AdminThumb url={c.images[0]?.url} alt={name(c)} />
                  </td>
                  <td data-label={t('Name', 'الاسم')}>
                    <Link href={`/${locale}/admin/collections/${c.id}`}>{name(c)}</Link>
                  </td>
                  <td data-label={t('Slug', 'الرابط')}>{c.slug}</td>
                  <td data-label={t('Status', 'الحالة')}>
                    {c.archivedAt ? (
                      <Badge variant="low-stock" className="admin-status-badge--archived">
                        {t('Archived', 'مؤرشفة')}
                      </Badge>
                    ) : c.isActive ? (
                      <Badge variant="new">{t('Active', 'مفعّلة')}</Badge>
                    ) : (
                      <Badge variant="low-stock">{t('Hidden', 'مخفية')}</Badge>
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
                    <span className="admin-row-actions">
                      <Link
                        href={`/${locale}/admin/collections/${c.id}`}
                        className="icon-btn icon-btn--bordered"
                        aria-label={t('Edit', 'تعديل')}
                        title={t('Edit', 'تعديل')}
                      >
                        <Icon as={Pencil} size={16} />
                      </Link>
                      {c.archivedAt ? (
                        <>
                          <button
                            type="button"
                            className="icon-btn icon-btn--bordered"
                            onClick={() => onRestore(c)}
                            disabled={busyId === c.id}
                            aria-label={t('Restore', 'استعادة')}
                            title={t('Restore', 'استعادة')}
                          >
                            <Icon as={RotateCcw} size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn icon-btn--bordered"
                            onClick={() => onPermanentDelete(c)}
                            disabled={busyId === c.id}
                            aria-label={t('Delete permanently', 'حذف نهائي')}
                            title={t('Delete permanently', 'حذف نهائي')}
                          >
                            <Icon as={Trash2} size={16} />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="icon-btn icon-btn--bordered"
                          onClick={() => onArchive(c)}
                          disabled={busyId === c.id}
                          aria-label={t('Archive', 'أرشفة')}
                          title={t('Archive', 'أرشفة')}
                        >
                          <Icon as={Archive} size={16} />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>

          <AdminPager page={safePage} totalPages={totalPages} onPageChange={setPage} locale={locale} />
        </>
      )}
    </div>
  );
}
