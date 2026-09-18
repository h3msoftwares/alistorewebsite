'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Copy, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { Alert, Button, Choice, ConfirmModal, DataTable, EmptyState, Icon, ProductGridSkeleton, RowActionsMenu } from '@/components/ui';
import { useRowSelection } from '@/hooks/use-row-selection';
import { usePermissions } from '@/lib/rbac';
import {
  useCoupons,
  useCreatePromotion,
  useDeleteCoupon,
  useDeletePromotion,
  usePromotions,
  useUpdatePromotion,
} from '@/hooks/use-discounts';
import type { Coupon, Promotion } from '@/lib/types';

type Tab = 'promotions' | 'coupons';

// The stored `status` alone doesn't say whether a promotion is actually
// live right now — an ACTIVE one can still be scheduled for the future or
// past its own end date. Derive what an admin actually wants to see.
type EffectiveStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'EXPIRED';

function effectiveStatus(p: Pick<Promotion, 'status' | 'startsAt' | 'endsAt'>): EffectiveStatus {
  if (p.status === 'DRAFT') return 'DRAFT';
  if (p.status === 'PAUSED') return 'PAUSED';
  if (p.status === 'ENDED') return 'EXPIRED';
  const now = Date.now();
  if (p.startsAt && new Date(p.startsAt).getTime() > now) return 'SCHEDULED';
  if (p.endsAt && new Date(p.endsAt).getTime() < now) return 'EXPIRED';
  return 'LIVE';
}

const EFFECTIVE_STATUS_LABELS: Record<EffectiveStatus, { en: string; ar: string }> = {
  DRAFT: { en: 'Draft', ar: 'مسودة' },
  SCHEDULED: { en: 'Scheduled', ar: 'مجدوَل' },
  LIVE: { en: 'Live', ar: 'فعّال الآن' },
  PAUSED: { en: 'Paused', ar: 'موقوف مؤقتًا' },
  EXPIRED: { en: 'Expired', ar: 'منتهٍ' },
};

function EffectiveStatusPill({ promotion, isAr }: { promotion: Promotion; isAr: boolean }) {
  const es = effectiveStatus(promotion);
  const label = EFFECTIVE_STATUS_LABELS[es];
  return <span className={`status status--${es.toLowerCase()}`}>{isAr ? label.ar : label.en}</span>;
}

function PromotionsList({ locale, isAr }: { locale: 'en' | 'ar'; isAr: boolean }) {
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const canManage = usePermissions().has('discounts:manage');
  const { data: promotions, isPending, isError, refetch } = usePromotions();
  const create = useCreatePromotion();
  const update = useUpdatePromotion();
  const remove = useDeletePromotion();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Promotion[] | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const busy = create.isPending || update.isPending || remove.isPending;
  const selection = useRowSelection((promotions ?? []).map((p) => p.id));

  // A copy starts as a DRAFT, never ACTIVE — landing two identical live
  // promotions at once (briefly stacking/competing on the same products)
  // would be a real pricing bug, not just a UX surprise.
  const duplicatePromotion = async (p: Promotion) => {
    setError(null);
    try {
      await create.mutateAsync({
        nameEn: t(`${p.nameEn} (copy)`, `${p.nameEn} (نسخة)`),
        nameAr: t(`${p.nameAr} (copy)`, `${p.nameAr} (نسخة)`),
        type: p.type,
        value: Number(p.value),
        priority: p.priority,
        stackable: p.stackable,
        appliesToAll: p.appliesToAll,
        productIds: p.products.map((x) => x.productID),
        categoryTargets: p.categories.map((c) => ({ categoryId: c.categoryID, includeDescendants: c.includeDescendants })),
        collectionIds: p.collections.map((c) => c.collectionID),
        status: 'DRAFT',
        startsAt: p.startsAt,
        endsAt: p.endsAt,
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
      await Promise.all(confirmDelete.map((p) => remove.mutateAsync(p.id)));
      selection.clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Delete failed', 'فشل الحذف'));
    } finally {
      setConfirmDelete(null);
      setConfirmBusy(false);
    }
  };

  const targetLabel = (p: Promotion) => {
    if (p.appliesToAll) return t('All items', 'كل المنتجات');
    const parts: string[] = [];
    if (p.products.length) parts.push(t(`${p.products.length} product(s)`, `${p.products.length} منتج`));
    if (p.categories.length) parts.push(t(`${p.categories.length} categor${p.categories.length === 1 ? 'y' : 'ies'}`, `${p.categories.length} فئة`));
    if (p.collections.length) parts.push(t(`${p.collections.length} collection(s)`, `${p.collections.length} مجموعة`));
    return parts.join(', ') || '—';
  };

  return (
    <div>
      <div className="admin-page__head">
        <h2 className="visually-hidden">{t('Promotions', 'العروض')}</h2>
        {canManage && (
          <Link href={`/${locale}/admin/discounts/promotions/new`} className="btn btn--primary">
            <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
            {t('New promotion', 'عرض جديد')}
          </Link>
        )}
      </div>

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
          title={t("Couldn't load promotions", 'تعذّر تحميل العروض')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      ) : (promotions ?? []).length === 0 ? (
        <EmptyState
          title={t('No promotions yet', 'لا توجد عروض بعد')}
          action={
            canManage ? (
              <Link href={`/${locale}/admin/discounts/promotions/new`} className="btn btn--primary">
                {t('New promotion', 'عرض جديد')}
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
                  onClick={() => setConfirmDelete((promotions ?? []).filter((p) => selection.selected.has(p.id)))}
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
              <th>{t('Discount', 'الخصم')}</th>
              <th>{t('Priority', 'الأولوية')}</th>
              <th>{t('Stackable', 'يتراكم')}</th>
              <th>{t('Window', 'المدة')}</th>
              <th>{t('Status', 'الحالة')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(promotions ?? []).map((p) => (
              <tr key={p.id}>
                {canManage && (
                  <td data-label={t('Select', 'تحديد')}>
                    <Choice
                      type="checkbox"
                      checked={selection.selected.has(p.id)}
                      onChange={() => selection.toggle(p.id)}
                      label={<span className="visually-hidden">{t(`Select ${isAr ? p.nameAr : p.nameEn}`, `تحديد ${isAr ? p.nameAr : p.nameEn}`)}</span>}
                    />
                  </td>
                )}
                <td data-label={t('Name', 'الاسم')}>{isAr ? p.nameAr : p.nameEn}</td>
                <td data-label={t('Applies to', 'يطبَّق على')}>{targetLabel(p)}</td>
                <td data-label={t('Discount', 'الخصم')}>
                  {p.type === 'PERCENT' ? `${Number(p.value)}%` : `$${Number(p.value).toFixed(2)}`}
                </td>
                <td data-label={t('Priority', 'الأولوية')}>{p.priority}</td>
                <td data-label={t('Stackable', 'يتراكم')}>{p.stackable ? t('Yes', 'نعم') : t('No', 'لا')}</td>
                <td data-label={t('Window', 'المدة')}>
                  {p.startsAt || p.endsAt
                    ? `${p.startsAt ? new Date(p.startsAt).toLocaleDateString() : '…'} – ${p.endsAt ? new Date(p.endsAt).toLocaleDateString() : '…'}`
                    : t('Always', 'دائمًا')}
                </td>
                <td data-label={t('Status', 'الحالة')}>
                  <EffectiveStatusPill promotion={p} isAr={isAr} />
                </td>
                <td>
                  <span className="admin-row-actions">
                    <Link href={`/${locale}/admin/discounts/promotions/${p.id}`} className="btn btn--ghost btn--sm">
                      {t('Edit', 'تعديل')}
                    </Link>
                    {canManage && (
                      <RowActionsMenu
                        label={t('More actions', 'المزيد من الإجراءات')}
                        actions={[
                          ...(p.status === 'ACTIVE' || p.status === 'PAUSED'
                            ? [
                                {
                                  label: p.status === 'ACTIVE' ? t('Pause', 'إيقاف مؤقت') : t('Resume', 'استئناف'),
                                  icon: p.status === 'ACTIVE' ? Pause : Play,
                                  onClick: () =>
                                    update.mutate({ id: p.id, body: { status: p.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' } }),
                                  disabled: busy,
                                },
                              ]
                            : []),
                          { label: t('Duplicate', 'نسخ'), icon: Copy, onClick: () => void duplicatePromotion(p), disabled: busy },
                          { label: t('Delete', 'حذف'), icon: Trash2, tone: 'danger', onClick: () => setConfirmDelete([p]) },
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
            ? t('Delete this promotion?', 'حذف هذا العرض؟')
            : t(`Delete ${confirmDelete?.length ?? 0} promotions?`, `حذف ${confirmDelete?.length ?? 0} عروض؟`)
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

function CouponsList({ locale, isAr }: { locale: 'en' | 'ar'; isAr: boolean }) {
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const canManage = usePermissions().has('discounts:manage');
  const { data: coupons, isPending, isError, refetch } = useCoupons();
  const remove = useDeleteCoupon();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Coupon[] | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const busy = remove.isPending;
  const selection = useRowSelection((coupons ?? []).map((c) => c.id));

  const runDelete = async () => {
    if (!confirmDelete) return;
    setConfirmBusy(true);
    setError(null);
    try {
      await Promise.all(confirmDelete.map((c) => remove.mutateAsync(c.id)));
      selection.clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Delete failed', 'فشل الحذف'));
    } finally {
      setConfirmDelete(null);
      setConfirmBusy(false);
    }
  };

  return (
    <div>
      <div className="admin-page__head">
        <h2 className="visually-hidden">{t('Coupons', 'القسائم')}</h2>
        {canManage && (
          <Link href={`/${locale}/admin/discounts/coupons/new`} className="btn btn--primary">
            <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
            {t('New coupon', 'قسيمة جديدة')}
          </Link>
        )}
      </div>

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
          title={t("Couldn't load coupons", 'تعذّر تحميل القسائم')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      ) : (coupons ?? []).length === 0 ? (
        <EmptyState
          title={t('No coupons yet', 'لا توجد قسائم بعد')}
          action={
            canManage ? (
              <Link href={`/${locale}/admin/discounts/coupons/new`} className="btn btn--primary">
                {t('New coupon', 'قسيمة جديدة')}
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
                  onClick={() => setConfirmDelete((coupons ?? []).filter((c) => selection.selected.has(c.id)))}
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
              <th>{t('Code', 'الرمز')}</th>
              <th>{t('Discount', 'الخصم')}</th>
              <th>{t('Window', 'المدة')}</th>
              <th>{t('Used', 'الاستخدام')}</th>
              <th>{t('Status', 'الحالة')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(coupons ?? []).map((c: Coupon) => (
              <tr key={c.id}>
                {canManage && (
                  <td data-label={t('Select', 'تحديد')}>
                    <Choice
                      type="checkbox"
                      checked={selection.selected.has(c.id)}
                      onChange={() => selection.toggle(c.id)}
                      label={<span className="visually-hidden">{t(`Select ${c.code}`, `تحديد ${c.code}`)}</span>}
                    />
                  </td>
                )}
                <td data-label={t('Code', 'الرمز')}>{c.code}</td>
                <td data-label={t('Discount', 'الخصم')}>
                  {c.type === 'PERCENT' ? `${Number(c.value)}%` : `$${Number(c.value).toFixed(2)}`}
                </td>
                <td data-label={t('Window', 'المدة')}>
                  {c.startsAt || c.endsAt
                    ? `${c.startsAt ? new Date(c.startsAt).toLocaleDateString() : '…'} – ${c.endsAt ? new Date(c.endsAt).toLocaleDateString() : '…'}`
                    : t('Always', 'دائمًا')}
                </td>
                <td data-label={t('Used', 'الاستخدام')}>
                  {c.timesRedeemed} / {c.maxRedemptions ?? '∞'}
                  {c.maxPerCustomer ? (
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      {' '}
                      ({t(`max ${c.maxPerCustomer}/customer`, `الحد ${c.maxPerCustomer}/عميل`)})
                    </span>
                  ) : null}
                </td>
                <td data-label={t('Status', 'الحالة')}>{c.isActive ? t('Active', 'مُفعَّل') : t('Off', 'موقوف')}</td>
                <td>
                  <span className="admin-row-actions">
                    <Link href={`/${locale}/admin/discounts/coupons/${c.id}`} className="btn btn--ghost btn--sm">
                      {t('Edit', 'تعديل')}
                    </Link>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDelete([c])}
                        disabled={busy}
                      >
                        {t('Delete', 'حذف')}
                      </Button>
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
            ? t('Delete this coupon?', 'حذف هذه القسيمة؟')
            : t(`Delete ${confirmDelete?.length ?? 0} coupons?`, `حذف ${confirmDelete?.length ?? 0} قسائم؟`)
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

export default function AdminDiscountsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'coupons' ? 'coupons' : 'promotions');

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Discounts', 'الخصومات')}</h1>
      </div>

      <nav className="tab-strip settings-tabs" aria-label={t('Discount sections', 'أقسام الخصومات')}>
        <button
          type="button"
          className="tab-strip__link"
          data-active={tab === 'promotions' ? '' : undefined}
          aria-pressed={tab === 'promotions'}
          onClick={() => setTab('promotions')}
        >
          {t('Promotions', 'العروض')}
        </button>
        <button
          type="button"
          className="tab-strip__link"
          data-active={tab === 'coupons' ? '' : undefined}
          aria-pressed={tab === 'coupons'}
          onClick={() => setTab('coupons')}
        >
          {t('Coupons', 'القسائم')}
        </button>
      </nav>

      {tab === 'promotions' ? <PromotionsList locale={locale} isAr={isAr} /> : <CouponsList locale={locale} isAr={isAr} />}
    </div>
  );
}
