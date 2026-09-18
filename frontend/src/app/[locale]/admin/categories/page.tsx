'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, Choice, ConfirmModal, DataTable, EmptyState, Icon, ProductGridSkeleton, RowActionsMenu } from '@/components/ui';
import { AdminThumb } from '@/components/admin/admin-thumb';
import { AdminListControls } from '@/components/admin/admin-list-controls';
import { AdminPager } from '@/components/admin/admin-pager';
import { useRowSelection } from '@/hooks/use-row-selection';
import { usePermissions } from '@/lib/rbac';
import {
  useAdminCategories,
  useDeleteCategory,
  usePermanentDeleteCategory,
  useRestoreCategory,
} from '@/hooks/use-catalog';
import type { CatalogStatus, Category } from '@/lib/types';

const PAGE_SIZE = 20;

type PendingConfirm = { kind: 'archive' | 'delete'; ids: string[] };

export default function AdminCategoriesPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const canManage = usePermissions().has('categories:manage');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CatalogStatus>('active');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const { data, isPending, isError, refetch } = useAdminCategories({
    search: search || undefined,
    status,
  });
  const archive = useDeleteCategory();
  const restore = useRestoreCategory();
  const permanentDelete = usePermanentDeleteCategory();

  const rows = data ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => (data ?? []).slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [data, safePage]
  );
  const selection = useRowSelection(pageRows.map((c) => c.id));

  const name = (c: Category) => (isAr ? c.nameAr : c.nameEn);
  const byId = (id: string) => pageRows.find((c) => c.id === id);

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

  const onRestoreRow = (c: Category) =>
    void runAction(c.id, () => restore.mutateAsync(c.id), t('Restore failed', 'فشلت الاستعادة'));

  const selectedItems = pageRows.filter((c) => selection.selected.has(c.id));
  const selectedActive = selectedItems.filter((c) => !c.archivedAt);
  const selectedArchived = selectedItems.filter((c) => c.archivedAt);

  const onBulkRestore = async () => {
    setActionError(null);
    setBulkBusy(true);
    try {
      await Promise.all(selectedArchived.map((c) => restore.mutateAsync(c.id)));
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
        : t(`Archive ${confirmCount} categories?`, `أرشفة ${confirmCount} فئات؟`)
      : confirmSingle
        ? t(`Permanently delete "${name(confirmSingle)}"?`, `حذف "${name(confirmSingle)}" نهائيًا؟`)
        : t(`Permanently delete ${confirmCount} categories?`, `حذف ${confirmCount} فئات نهائيًا؟`);
  const confirmBody =
    confirm?.kind === 'archive'
      ? t('It will be hidden from the storefront but kept.', 'ستُخفى من المتجر مع الاحتفاظ بها.')
      : t('This cannot be undone.', 'لا يمكن التراجع عن هذا.');

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Categories', 'الفئات')}</h1>
        {canManage && (
          <Link href={`/${locale}/admin/categories/new`} className="btn btn--primary">
            <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
            {t('New category', 'فئة جديدة')}
          </Link>
        )}
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
          title={t("Couldn't load categories", 'تعذّر تحميل الفئات')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={search || status !== 'active' ? t('No matches', 'لا نتائج') : t('No categories yet', 'لا توجد فئات بعد')}
          action={
            canManage ? (
              <Link href={`/${locale}/admin/categories/new`} className="btn btn--primary">
                {t('New category', 'فئة جديدة')}
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
                    onClick={() => setConfirm({ kind: 'archive', ids: selectedActive.map((c) => c.id) })}
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
                <th>{t('Slug', 'الرابط')}</th>
                <th>{t('Parent', 'الفئة الأصل')}</th>
                <th>{t('Status', 'الحالة')}</th>
                <th>{t('Home', 'الرئيسية')}</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => (
                <tr key={c.id}>
                  {canManage && (
                    <td data-label={t('Select', 'تحديد')}>
                      <Choice
                        type="checkbox"
                        checked={selection.selected.has(c.id)}
                        onChange={() => selection.toggle(c.id)}
                        label={<span className="visually-hidden">{t(`Select ${name(c)}`, `تحديد ${name(c)}`)}</span>}
                      />
                    </td>
                  )}
                  <td data-label={t('Image', 'الصورة')}>
                    <AdminThumb url={c.images[0]?.url} alt={name(c)} />
                  </td>
                  <td data-label={t('Name', 'الاسم')}>
                    <Link href={`/${locale}/admin/categories/${c.id}`}>{name(c)}</Link>
                  </td>
                  <td data-label={t('Slug', 'الرابط')}>{c.slug}</td>
                  <td data-label={t('Parent', 'الفئة الأصل')}>
                    {c.parent ? (isAr ? c.parent.nameAr : c.parent.nameEn) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>{t('Top level', 'المستوى الأعلى')}</span>
                    )}
                  </td>
                  <td data-label={t('Status', 'الحالة')}>
                    {c.archivedAt ? (
                      <Badge variant="low-stock" className="admin-status-badge--archived">
                        {t('Archived', 'مؤرشفة')}
                      </Badge>
                    ) : c.isEffectivelyArchived ? (
                      // Not archived itself, but unreachable on the storefront
                      // because an ancestor is — flagged distinctly so this
                      // doesn't read as indistinguishable from a genuinely
                      // active category (fix-list.md #15's principle, carried
                      // onto the tree — see category-form.tsx's picker).
                      <Badge variant="low-stock" className="admin-status-badge--archived">
                        {t('Parent archived', 'الفئة الأصل مؤرشفة')}
                      </Badge>
                    ) : c.isActive ? (
                      <Badge variant="new">{t('Active', 'مفعّلة')}</Badge>
                    ) : (
                      <Badge variant="low-stock">{t('Hidden', 'مخفية')}</Badge>
                    )}
                  </td>
                  <td data-label={t('Home', 'الرئيسية')}>{c.showOnHome ? t('Yes', 'نعم') : '—'}</td>
                  <td data-label={t('Actions', 'إجراءات')}>
                    <span className="admin-row-actions">
                      <Link
                        href={`/${locale}/admin/categories/${c.id}`}
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
                            c.archivedAt
                              ? [
                                  {
                                    label: t('Restore', 'استعادة'),
                                    icon: RotateCcw,
                                    onClick: () => onRestoreRow(c),
                                    disabled: busyId === c.id,
                                  },
                                  {
                                    label: t('Delete permanently', 'حذف نهائي'),
                                    icon: Trash2,
                                    tone: 'danger',
                                    onClick: () => setConfirm({ kind: 'delete', ids: [c.id] }),
                                  },
                                ]
                              : [
                                  {
                                    label: t('Archive', 'أرشفة'),
                                    icon: Archive,
                                    onClick: () => setConfirm({ kind: 'archive', ids: [c.id] }),
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

          <AdminPager page={safePage} totalPages={totalPages} onPageChange={setPage} locale={locale} />
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
