'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, Choice, ConfirmModal, DataTable, EmptyState, Icon, ProductGridSkeleton, RowActionsMenu } from '@/components/ui';
import { AdminThumb } from '@/components/admin/admin-thumb';
import { AdminListControls } from '@/components/admin/admin-list-controls';
import { AdminPager } from '@/components/admin/admin-pager';
import { useRowSelection } from '@/hooks/use-row-selection';
import { usePermissions } from '@/lib/rbac';
import {
  useDeleteProduct,
  usePermanentDeleteProduct,
  useProducts,
  useRestoreProduct,
} from '@/hooks/use-catalog';
import { useSettings, useUpdateSettings } from '@/hooks/use-settings';
import type { CatalogStatus, Product } from '@/lib/types';

const PAGE_SIZE = 20;

type PendingConfirm = { kind: 'archive' | 'delete'; ids: string[] };

export function AdminProductsPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const canManage = usePermissions().has('products:manage');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CatalogStatus>('active');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const { data, isPending, isError, refetch } = useProducts({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status,
  });
  const archive = useDeleteProduct();
  const restore = useRestoreProduct();
  const permanentDelete = usePermanentDeleteProduct();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const selection = useRowSelection(items.map((p) => p.id));

  const name = (p: Product) => (isAr ? p.nameAr : p.nameEn);
  const byId = (id: string) => items.find((p) => p.id === id);

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

  const onRestoreRow = (p: Product) => void runAction(p.id, () => restore.mutateAsync(p.id), t('Restore failed', 'فشلت الاستعادة'));

  const selectedItems = items.filter((p) => selection.selected.has(p.id));
  const selectedActive = selectedItems.filter((p) => !p.deletedAt);
  const selectedArchived = selectedItems.filter((p) => p.deletedAt);

  const onBulkRestore = async () => {
    setActionError(null);
    setBulkBusy(true);
    try {
      await Promise.all(selectedArchived.map((p) => restore.mutateAsync(p.id)));
      selection.clear();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('Restore failed', 'فشلت الاستعادة'));
    } finally {
      setBulkBusy(false);
    }
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    setActionError(null);
    try {
      if (confirm.kind === 'archive') {
        await Promise.all(confirm.ids.map((id) => archive.mutateAsync(id)));
      } else {
        await Promise.all(confirm.ids.map((id) => permanentDelete.mutateAsync(id)));
      }
      selection.clear();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('Action failed', 'فشل الإجراء'));
    } finally {
      // Close either way: an error alert rendered on the page would be
      // hidden behind the still-open modal overlay otherwise.
      setConfirm(null);
      setConfirmBusy(false);
    }
  };

  const confirmCount = confirm?.ids.length ?? 0;
  const confirmSingle = confirmCount === 1 ? byId(confirm!.ids[0]) : undefined;
  const confirmTitle =
    confirm?.kind === 'archive'
      ? confirmSingle
        ? t(`Archive "${name(confirmSingle)}"?`, `أرشفة "${name(confirmSingle)}"؟`)
        : t(`Archive ${confirmCount} products?`, `أرشفة ${confirmCount} منتجات؟`)
      : confirmSingle
        ? t(`Permanently delete "${name(confirmSingle)}"?`, `حذف "${name(confirmSingle)}" نهائيًا؟`)
        : t(`Permanently delete ${confirmCount} products?`, `حذف ${confirmCount} منتجات نهائيًا؟`);
  const confirmBody =
    confirm?.kind === 'archive'
      ? t('Archived products are hidden from the storefront but kept — you can restore them later.', 'المنتجات المؤرشفة تُخفى عن المتجر مع الاحتفاظ بها — يمكنك استعادتها لاحقًا.')
      : t('This cannot be undone.', 'لا يمكن التراجع عن هذا.');

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Products', 'المنتجات')}</h1>
        {canManage && (
          <Link href={`/${locale}/admin/products/new`} className="btn btn--primary">
            <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
            {t('New product', 'منتج جديد')}
          </Link>
        )}
      </div>

      {canManage && (
        <div className="admin-page__head-actions">
          <Choice
            type="checkbox"
            label={t('Auto-tag restocked products', 'وسم المنتجات المعاد تخزينها تلقائيًا')}
            checked={settings?.autoTagRestock ?? false}
            onChange={(e) => updateSettings.mutate({ autoTagRestock: e.target.checked })}
            disabled={!settings || updateSettings.isPending}
          />
          <span className="admin-form__hint">
            {t(
              'When on, a variant’s stock going from 0 to available adds the "Restocked" tag automatically.',
              'عند التفعيل، يُضاف وسم «أُعيد تخزينه» تلقائيًا عندما يتحول مخزون أحد الخيارات من صفر إلى متوفر.'
            )}
          </span>
        </div>
      )}

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
          title={t("Couldn't load products", 'تعذّر تحميل المنتجات')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={search || status !== 'active' ? t('No matches', 'لا نتائج') : t('No products yet', 'لا توجد منتجات بعد')}
          action={
            canManage ? (
              <Link href={`/${locale}/admin/products/new`} className="btn btn--primary">
                {t('New product', 'منتج جديد')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {canManage && selection.count > 0 && (
            <div className="admin-bulk-bar">
              <span className="admin-bulk-bar__count">
                {t(`${selection.count} selected`, `${selection.count} محدد`)}
              </span>
              <span className="admin-bulk-bar__actions">
                {selectedActive.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirm({ kind: 'archive', ids: selectedActive.map((p) => p.id) })}
                  >
                    {t(`Archive (${selectedActive.length})`, `أرشفة (${selectedActive.length})`)}
                  </Button>
                )}
                {selectedArchived.length > 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => void onBulkRestore()} loading={bulkBusy}>
                    {t(`Restore (${selectedArchived.length})`, `استعادة (${selectedArchived.length})`)}
                  </Button>
                )}
                <button type="button" className="admin-bulk-bar__clear" onClick={selection.clear}>
                  {t('Clear', 'إلغاء التحديد')}
                </button>
              </span>
            </div>
          )}

          <DataTable responsive>
            <thead>
              <tr>
                {canManage && (
                  <th aria-hidden="true">
                    <Choice
                      type="checkbox"
                      checked={selection.allSelected}
                      onChange={selection.toggleAll}
                      label={<span className="visually-hidden">{t('Select all', 'تحديد الكل')}</span>}
                    />
                  </th>
                )}
                <th aria-hidden="true" />
                <th>{t('Name', 'الاسم')}</th>
                <th>{t('SKU', 'رمز المنتج')}</th>
                <th>{t('Category', 'الفئة')}</th>
                <th>{t('Price', 'السعر')}</th>
                <th>{t('Stock', 'المخزون')}</th>
                <th>{t('Status', 'الحالة')}</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  {canManage && (
                    <td data-label={t('Select', 'تحديد')}>
                      <Choice
                        type="checkbox"
                        checked={selection.selected.has(p.id)}
                        onChange={() => selection.toggle(p.id)}
                        label={<span className="visually-hidden">{t(`Select ${name(p)}`, `تحديد ${name(p)}`)}</span>}
                      />
                    </td>
                  )}
                  <td data-label={t('Image', 'الصورة')}>
                    <AdminThumb url={p.images[0]?.url} alt={name(p)} />
                  </td>
                  <td data-label={t('Name', 'الاسم')}>
                    <Link href={`/${locale}/admin/products/${p.id}`}>{name(p)}</Link>
                  </td>
                  <td data-label={t('SKU', 'رمز المنتج')}>{p.sku}</td>
                  <td data-label={t('Category', 'الفئة')}>
                    {p.primaryCategory ? (isAr ? p.primaryCategory.nameAr : p.primaryCategory.nameEn) : '—'}
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
                  {/* Stock is per-variant, not a product-level field — sum it here. */}
                  <td data-label={t('Stock', 'المخزون')}>
                    {p.variants.reduce((sum, v) => sum + v.stockQuantity, 0)}
                  </td>
                  <td data-label={t('Status', 'الحالة')}>
                    {p.deletedAt ? (
                      <Badge variant="low-stock" className="admin-status-badge--archived">
                        {t('Archived', 'مؤرشف')}
                      </Badge>
                    ) : p.isActive ? (
                      <Badge variant="new">{t('Active', 'مفعّل')}</Badge>
                    ) : (
                      <Badge variant="low-stock">{t('Hidden', 'مخفي')}</Badge>
                    )}
                    {p.isRestocked && (
                      <Badge variant="restock" style={{ marginInlineStart: 'var(--space-2)' }}>
                        {t('Restocked', 'أُعيد تخزينه')}
                      </Badge>
                    )}
                  </td>
                  <td data-label={t('Actions', 'إجراءات')}>
                    <span className="admin-row-actions">
                      <Link
                        href={`/${locale}/admin/products/${p.id}`}
                        className="icon-btn icon-btn--bordered"
                        aria-label={t('Edit', 'تعديل')}
                        title={t('Edit', 'تعديل')}
                      >
                        <Icon as={Pencil} size={16} />
                      </Link>
                      {canManage && (
                        <RowActionsMenu
                          label={t('More actions', 'المزيد من الإجراءات')}
                          actions={
                            p.deletedAt
                              ? [
                                  {
                                    label: t('Restore', 'استعادة'),
                                    icon: RotateCcw,
                                    onClick: () => onRestoreRow(p),
                                    disabled: busyId === p.id,
                                  },
                                  {
                                    label: t('Delete permanently', 'حذف نهائي'),
                                    icon: Trash2,
                                    tone: 'danger',
                                    onClick: () => setConfirm({ kind: 'delete', ids: [p.id] }),
                                  },
                                ]
                              : [
                                  {
                                    label: t('Archive', 'أرشفة'),
                                    icon: Archive,
                                    onClick: () => setConfirm({ kind: 'archive', ids: [p.id] }),
                                  },
                                ]
                          }
                        />
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>

          <AdminPager page={data?.page ?? page} totalPages={totalPages} onPageChange={setPage} locale={locale} />
        </>
      )}

      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => void runConfirmed()}
        title={confirmTitle}
        body={confirmBody}
        confirmLabel={confirm?.kind === 'delete' ? t('Delete', 'حذف') : t('Archive', 'أرشفة')}
        cancelLabel={t('Cancel', 'إلغاء')}
        tone={confirm?.kind === 'delete' ? 'danger' : 'default'}
        loading={confirmBusy}
      />
    </div>
  );
}
