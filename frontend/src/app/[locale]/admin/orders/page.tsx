'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  ProductGridSkeleton,
  Select,
  StatusPill,
} from '@/components/ui';
import { AdminPager } from '@/components/admin/admin-pager';
import { useAdminOrders, useMarkOrderCollected, useReviewOrder, useUpdateOrderStatus } from '@/hooks/use-orders';
import type { Order, OrderStatus } from '@/lib/types';

const PAGE_SIZE = 20;

const STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
];

export default function AdminOrdersPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const money = (n: number) =>
    new Intl.NumberFormat(isAr ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: 'USD',
      numberingSystem: 'latn',
    }).format(n);
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useAdminOrders(status || undefined, flaggedOnly || undefined);
  const updateStatus = useUpdateOrderStatus();
  const markCollected = useMarkOrderCollected();
  const reviewOrder = useReviewOrder();

  const total = data?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => (data ?? []).slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [data, safePage]
  );

  const run = async (id: string, fn: () => Promise<unknown>, failMsg: string) => {
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

  const itemCount = (o: Order) => o.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Orders', 'الطلبات')}</h1>
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={(e) => {
                setFlaggedOnly(e.target.checked);
                setPage(1);
              }}
            />
            {t('Flagged only', 'المُعلَّمة فقط')}
          </label>
          <label>
            <span className="visually-hidden">{t('Filter by status', 'تصفية حسب الحالة')}</span>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as OrderStatus | '');
                setPage(1);
              }}
            >
              <option value="">{t('All statuses', 'كل الحالات')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>

      {actionError && (
        <Alert tone="danger" className="stack">
          {actionError}
        </Alert>
      )}

      {isPending ? (
        <ProductGridSkeleton count={4} />
      ) : isError ? (
        <EmptyState
          tone="alert"
          title={t("Couldn't load orders", 'تعذّر تحميل الطلبات')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      ) : total === 0 ? (
        <EmptyState
          title={
            flaggedOnly
              ? t('No flagged orders', 'لا طلبات معلَّمة')
              : status
                ? t('No orders with this status', 'لا طلبات بهذه الحالة')
                : t('No orders yet', 'لا توجد طلبات بعد')
          }
        />
      ) : (
        <>
          <DataTable responsive>
            <thead>
              <tr>
                <th>{t('Order', 'الطلب')}</th>
                <th>{t('Date', 'التاريخ')}</th>
                <th>{t('Customer', 'الزبون')}</th>
                <th className="is-numeric">{t('Items', 'القطع')}</th>
                <th className="is-numeric">{t('Total', 'الإجمالي')}</th>
                <th>{t('Payment', 'الدفع')}</th>
                <th>{t('Status', 'الحالة')}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((o) => {
                const busy = busyId === o.id;
                const collected = o.paymentStatus === 'COLLECTED';
                return (
                  <tr key={o.id} aria-busy={busy || undefined}>
                    <td data-label={t('Order', 'الطلب')}>{o.orderNumber}</td>
                    <td data-label={t('Date', 'التاريخ')}>{date(o.dateCreated)}</td>
                    <td data-label={t('Customer', 'الزبون')}>
                      {o.deliveryName} {o.flaggedForReview && <Badge variant="sale">{t('Flagged', 'معلَّم')}</Badge>}
                      <br />
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--fs-xs)' }}>
                        {o.deliveryPhone}
                        {o.guestEmail ? ` · ${o.guestEmail}` : ''}
                      </span>
                    </td>
                    <td className="is-numeric" data-label={t('Items', 'القطع')}>
                      {itemCount(o)}
                    </td>
                    <td
                      className="is-numeric"
                      data-label={t('Total', 'الإجمالي')}
                      title={t(
                        `Subtotal ${money(Number(o.subtotal))} + delivery ${money(Number(o.deliveryFee))}`,
                        `المجموع الفرعي ${money(Number(o.subtotal))} + التوصيل ${money(Number(o.deliveryFee))}`
                      )}
                    >
                      {money(Number(o.total))}
                    </td>
                    <td data-label={t('Payment', 'الدفع')}>
                      <span className="admin-row-actions">
                        <Badge variant={collected ? 'new' : 'low-stock'}>
                          {o.paymentMethod} · {o.paymentStatus}
                        </Badge>
                        {o.paymentMethod === 'COD' && o.paymentStatus !== 'REFUNDED' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              run(
                                o.id,
                                () => markCollected.mutateAsync({ id: o.id, collected: !collected }),
                                t('Update failed', 'فشل التحديث')
                              )
                            }
                          >
                            {collected ? t('Mark unpaid', 'إلغاء التحصيل') : t('Mark collected', 'تم التحصيل')}
                          </Button>
                        )}
                      </span>
                    </td>
                    <td data-label={t('Status', 'الحالة')}>
                      <span className="admin-row-actions">
                        <StatusPill status={o.status} locale={locale} />
                        {o.flaggedForReview && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              run(
                                o.id,
                                () => reviewOrder.mutateAsync(o.id),
                                t('Update failed', 'فشل التحديث')
                              )
                            }
                          >
                            {t('Mark reviewed', 'وضع علامة كمُراجَع')}
                          </Button>
                        )}
                        <Select
                          aria-label={t(`Change status for ${o.orderNumber}`, `تغيير حالة ${o.orderNumber}`)}
                          value={o.status}
                          disabled={busy}
                          onChange={(e) =>
                            run(
                              o.id,
                              () =>
                                updateStatus.mutateAsync({
                                  id: o.id,
                                  status: e.target.value as OrderStatus,
                                }),
                              t('Status change failed', 'فشل تغيير الحالة')
                            )
                          }
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Select>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>

          <AdminPager page={safePage} totalPages={totalPages} onPageChange={setPage} locale={locale} />
        </>
      )}
    </div>
  );
}
