'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Copy, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { Alert, Button, Choice, ConfirmModal, DataTable, EmptyState, Icon, ProductGridSkeleton, RowActionsMenu } from '@/components/ui';
import { useRowSelection } from '@/hooks/use-row-selection';
import { usePermissions } from '@/lib/rbac';
import { useComboRules, useCreateComboRule, useDeleteComboRule, useUpdateComboRule } from '@/hooks/use-combos';
import type { ComboRule } from '@/lib/types';

// Same "stored status alone doesn't say whether it's actually live right
// now" derivation as discounts/page.tsx's EffectiveStatusPill — kept as its
// own copy here (not shared) since it's a five-line pure function, not worth
// a cross-feature import for.
type EffectiveStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'EXPIRED';

function effectiveStatus(r: Pick<ComboRule, 'status' | 'startsAt' | 'endsAt'>): EffectiveStatus {
  if (r.status === 'DRAFT') return 'DRAFT';
  if (r.status === 'PAUSED') return 'PAUSED';
  if (r.status === 'ENDED') return 'EXPIRED';
  const now = Date.now();
  if (r.startsAt && new Date(r.startsAt).getTime() > now) return 'SCHEDULED';
  if (r.endsAt && new Date(r.endsAt).getTime() < now) return 'EXPIRED';
  return 'LIVE';
}

const EFFECTIVE_STATUS_LABELS: Record<EffectiveStatus, { en: string; ar: string }> = {
  DRAFT: { en: 'Draft', ar: 'مسودة' },
  SCHEDULED: { en: 'Scheduled', ar: 'مجدوَل' },
  LIVE: { en: 'Live', ar: 'فعّال الآن' },
  PAUSED: { en: 'Paused', ar: 'موقوف مؤقتًا' },
  EXPIRED: { en: 'Expired', ar: 'منتهٍ' },
};

function EffectiveStatusPill({ rule, isAr }: { rule: ComboRule; isAr: boolean }) {
  const es = effectiveStatus(rule);
  const label = EFFECTIVE_STATUS_LABELS[es];
  return <span className={`status status--${es.toLowerCase()}`}>{isAr ? label.ar : label.en}</span>;
}

function tiersLabel(rule: ComboRule, t: (en: string, ar: string) => string) {
  return rule.tiers
    .map((tier) => {
      const range = tier.maxQty == null ? `${tier.minQty}+` : tier.minQty === tier.maxQty ? `${tier.minQty}` : `${tier.minQty}-${tier.maxQty}`;
      return `${range} ${t('for', 'مقابل')} $${Number(tier.price).toFixed(2)}`;
    })
    .join(', ');
}

export default function AdminCombosPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const canManage = usePermissions().has('combos:manage');

  const { data: comboRules, isPending, isError, refetch } = useComboRules();
  const create = useCreateComboRule();
  const update = useUpdateComboRule();
  const remove = useDeleteComboRule();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ComboRule[] | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const busy = create.isPending || update.isPending || remove.isPending;
  const selection = useRowSelection((comboRules ?? []).map((r) => r.id));

  // Same "a copy starts as DRAFT" rationale as discounts/page.tsx's
  // duplicatePromotion — two identical live combo rules briefly competing on
  // the same products would be a real pricing bug, not just a UX surprise.
  const duplicateComboRule = async (r: ComboRule) => {
    setError(null);
    try {
      await create.mutateAsync({
        nameEn: t(`${r.nameEn} (copy)`, `${r.nameEn} (نسخة)`),
        nameAr: t(`${r.nameAr} (copy)`, `${r.nameAr} (نسخة)`),
        priority: r.priority,
        appliesToAll: r.appliesToAll,
        productIds: r.products.map((x) => x.productID),
        categoryTargets: r.categories.map((c) => ({ categoryId: c.categoryID, includeDescendants: c.includeDescendants })),
        collectionIds: r.collections.map((c) => c.collectionID),
        status: 'DRAFT',
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        tiers: r.tiers.map((tier) => ({ minQty: tier.minQty, maxQty: tier.maxQty, price: Number(tier.price) })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Duplicate failed', 'فشل النسخ'));
    }
  };

  const runDelete = async () => {
    if (!confirmDelete) return;
    setConfirmBusy(true);
    setError(null);
    try {
      await Promise.all(confirmDelete.map((r) => remove.mutateAsync(r.id)));
      selection.clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Delete failed', 'فشل الحذف'));
    } finally {
      setConfirmDelete(null);
      setConfirmBusy(false);
    }
  };

  const targetLabel = (r: ComboRule) => {
    if (r.appliesToAll) return t('All items', 'كل المنتجات');
    const parts: string[] = [];
    if (r.products.length) parts.push(t(`${r.products.length} product(s)`, `${r.products.length} منتج`));
    if (r.categories.length) parts.push(t(`${r.categories.length} categor${r.categories.length === 1 ? 'y' : 'ies'}`, `${r.categories.length} فئة`));
    if (r.collections.length) parts.push(t(`${r.collections.length} collection(s)`, `${r.collections.length} مجموعة`));
    return parts.join(', ') || '—';
  };

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Combo pricing', 'التسعير التجميعي')}</h1>
        {canManage && (
          <Link href={`/${locale}/admin/combos/new`} className="btn btn--primary">
            <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
            {t('New combo rule', 'قاعدة تجميع جديدة')}
          </Link>
        )}
      </div>
      <p className="admin-form__hint">
        {t(
          'Cart-level "buy N, pay $X total" pricing across one product or a set of products/categories. A shopper always pays whichever is cheaper: this tier pricing, or each item priced individually.',
          'تسعير على مستوى السلة بنمط "اشترِ N وادفع X$ إجمالاً" لمنتج واحد أو مجموعة منتجات/فئات. يدفع المتسوق دائمًا السعر الأقل بين هذا التسعير أو تسعير كل قطعة على حدة.'
        )}
      </p>

      {error && (
        <Alert tone="danger" className="stack">
          {error}
        </Alert>
      )}

      {isPending ? (
        <ProductGridSkeleton count={3} />
      ) : isError ? (
        <EmptyState
          tone="alert"
          title={t("Couldn't load combo rules", 'تعذّر تحميل قواعد التجميع')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      ) : (comboRules ?? []).length === 0 ? (
        <EmptyState
          title={t('No combo rules yet', 'لا توجد قواعد تجميع بعد')}
          action={
            canManage ? (
              <Link href={`/${locale}/admin/combos/new`} className="btn btn--primary">
                {t('New combo rule', 'قاعدة تجميع جديدة')}
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="btn--danger-quiet"
                  onClick={() => setConfirmDelete((comboRules ?? []).filter((r) => selection.selected.has(r.id)))}
                >
                  {t(`Delete (${selection.count})`, `حذف (${selection.count})`)}
                </Button>
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
                <th>{t('Name', 'الاسم')}</th>
                <th>{t('Applies to', 'يطبَّق على')}</th>
                <th>{t('Tiers', 'الشرائح')}</th>
                <th>{t('Priority', 'الأولوية')}</th>
                <th>{t('Window', 'المدة')}</th>
                <th>{t('Status', 'الحالة')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(comboRules ?? []).map((r) => (
                <tr key={r.id}>
                  {canManage && (
                    <td data-label={t('Select', 'تحديد')}>
                      <Choice
                        type="checkbox"
                        checked={selection.selected.has(r.id)}
                        onChange={() => selection.toggle(r.id)}
                        label={<span className="visually-hidden">{t(`Select ${isAr ? r.nameAr : r.nameEn}`, `تحديد ${isAr ? r.nameAr : r.nameEn}`)}</span>}
                      />
                    </td>
                  )}
                  <td data-label={t('Name', 'الاسم')}>{isAr ? r.nameAr : r.nameEn}</td>
                  <td data-label={t('Applies to', 'يطبَّق على')}>{targetLabel(r)}</td>
                  <td data-label={t('Tiers', 'الشرائح')}>{tiersLabel(r, t)}</td>
                  <td data-label={t('Priority', 'الأولوية')}>{r.priority}</td>
                  <td data-label={t('Window', 'المدة')}>
                    {r.startsAt || r.endsAt
                      ? `${r.startsAt ? new Date(r.startsAt).toLocaleDateString() : '…'} – ${r.endsAt ? new Date(r.endsAt).toLocaleDateString() : '…'}`
                      : t('Always', 'دائمًا')}
                  </td>
                  <td data-label={t('Status', 'الحالة')}>
                    <EffectiveStatusPill rule={r} isAr={isAr} />
                  </td>
                  <td>
                    <span className="admin-row-actions">
                      <Link href={`/${locale}/admin/combos/${r.id}`} className="btn btn--ghost btn--sm">
                        {t('Edit', 'تعديل')}
                      </Link>
                      {canManage && (
                        <RowActionsMenu
                          label={t('More actions', 'المزيد من الإجراءات')}
                          actions={[
                            ...(r.status === 'ACTIVE' || r.status === 'PAUSED'
                              ? [
                                  {
                                    label: r.status === 'ACTIVE' ? t('Pause', 'إيقاف مؤقت') : t('Resume', 'استئناف'),
                                    icon: r.status === 'ACTIVE' ? Pause : Play,
                                    onClick: () =>
                                      update.mutate({ id: r.id, body: { status: r.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' } }),
                                    disabled: busy,
                                  },
                                ]
                              : []),
                            { label: t('Duplicate', 'نسخ'), icon: Copy, onClick: () => void duplicateComboRule(r), disabled: busy },
                            { label: t('Delete', 'حذف'), icon: Trash2, tone: 'danger', onClick: () => setConfirmDelete([r]) },
                          ]}
                        />
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      )}

      <ConfirmModal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => void runDelete()}
        title={
          confirmDelete?.length === 1
            ? t('Delete this combo rule?', 'حذف قاعدة التجميع هذه؟')
            : t(`Delete ${confirmDelete?.length ?? 0} combo rules?`, `حذف ${confirmDelete?.length ?? 0} قواعد تجميع؟`)
        }
        body={t('This cannot be undone.', 'لا يمكن التراجع عن هذا.')}
        confirmLabel={t('Delete', 'حذف')}
        cancelLabel={t('Cancel', 'إلغاء')}
        tone="danger"
        loading={confirmBusy}
      />
    </div>
  );
}
