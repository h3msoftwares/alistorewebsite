'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ChevronDown, Printer, Settings2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Choice,
  DataTable,
  EmptyState,
  Field,
  Icon,
  Input,
  Modal,
  ProductGridSkeleton,
  Select,
  StatusPill,
} from '@/components/ui';
import { AdminPager } from '@/components/admin/admin-pager';
import { OrderActionModals } from '@/components/orders/order-action-modals';
import { useAdminOrders } from '@/hooks/use-orders';
import { ORDER_STATUSES, useOrderActions } from '@/hooks/use-order-actions';
import { useOrderReceiptPrint } from '@/hooks/use-order-receipt-print';
import { usePrintPreferences } from '@/hooks/use-print-preferences';
import { useSettings } from '@/hooks/use-settings';
import { DELIVERY_REGIONS } from '@/lib/regions';
import type { ReceiptFormat } from '@/lib/print-preferences';
import { DEFAULT_BRAND_NAME_AR, DEFAULT_BRAND_NAME_EN } from '@/lib/site';
import { usePermissions } from '@/lib/rbac';
import type { Order, OrderStatus } from '@/lib/types';

const PAGE_SIZE = 20;

// The header filter's own option list — separate from STATUSES (which is the
// per-row status-CHANGER's options, always a single real status) because
// this one also offers a combined "in transit" bucket the dashboard's
// "Confirmed but not delivered" tile links to.
const STATUS_FILTER_OPTIONS: { value: string; en: string; ar: string }[] = [
  { value: 'PENDING', en: 'Pending', ar: 'قيد الانتظار' },
  { value: 'CONFIRMED,SHIPPED', en: 'Confirmed (not delivered)', ar: 'مؤكَّد (لم يُسلَّم)' },
  { value: 'CONFIRMED', en: 'Confirmed', ar: 'مؤكَّد' },
  { value: 'SHIPPED', en: 'Shipped', ar: 'تم الشحن' },
  { value: 'DELIVERED', en: 'Delivered', ar: 'تم التسليم' },
  { value: 'CANCELLED', en: 'Cancelled', ar: 'مُلغى' },
  { value: 'RETURNED', en: 'Returned', ar: 'مُرتجَع' },
];

export default function AdminOrdersPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const canManageBlacklist = usePermissions().has('orders:manage');
  const { data: settings } = useSettings();
  const brandName = settings ? (isAr ? settings.brandNameAr : settings.brandNameEn) : isAr ? DEFAULT_BRAND_NAME_AR : DEFAULT_BRAND_NAME_EN;
  const { receiptFormat, printerName, setReceiptFormat, setPrinterName } = usePrintPreferences();
  const [printSettingsOpen, setPrintSettingsOpen] = useState(false);
  const { print: printReceipt, receiptNode } = useOrderReceiptPrint(receiptFormat, brandName, locale);
  const oa = useOrderActions({
    statusChangeFailed: t('Status change failed', 'فشل تغيير الحالة'),
    updateFailed: t('Update failed', 'فشل التحديث'),
    daysRangeError: t('Enter a whole number of days (0–90), or leave blank.', 'أدخل عدد أيام صحيح (0–90)، أو اتركه فارغًا.'),
    incorrectPassword: t('Incorrect password.', 'كلمة المرور غير صحيحة.'),
  });

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

  // Seeded once from the URL so the dashboard's "Pending orders" / "Flagged
  // for review" / "Confirmed but not delivered" / "Awaiting COD" tiles can
  // deep-link straight into a filtered view instead of dumping the admin on
  // an unfiltered list they then have to filter by hand.
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams?.get('status') ?? '');
  const [flaggedOnly, setFlaggedOnly] = useState(() => searchParams?.get('flagged') === 'true');
  const [awaitingCod, setAwaitingCod] = useState(() => searchParams?.get('awaitingCod') === 'true');
  const [page, setPage] = useState(1);
  // Which rows show their delivery-address detail (area/city/region + notes)
  // — collapsed by default so the table reads less dense; the row's other
  // controls (status, Mark reviewed, Mark collected, print) are unaffected.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const statuses = statusFilter ? (statusFilter.split(',') as OrderStatus[]) : undefined;
  const { data, isPending, isError, refetch } = useAdminOrders(statuses, flaggedOnly || undefined, awaitingCod || undefined);

  const total = data?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => (data ?? []).slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [data, safePage]
  );

  const itemCount = (o: Order) => o.items.reduce((n, i) => n + i.quantity, 0);
  const regionLabel = (value?: string | null) => {
    const r = DELIVERY_REGIONS.find((x) => x.value === value);
    return r ? (isAr ? r.ar : r.en) : (value ?? '');
  };

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Orders', 'الطلبات')}</h1>
        <div className="admin-page__head-actions">
          {canManageBlacklist && (
            <Link href={`/${locale}/admin/orders/blacklist`} className="btn btn--outline">
              {t('Blacklist', 'قائمة الحظر')}
            </Link>
          )}
          <Button variant="outline" onClick={() => setPrintSettingsOpen(true)}>
            <Icon as={Settings2} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
            {t('Print settings', 'إعدادات الطباعة')}
          </Button>
          <Choice
            type="checkbox"
            label={t('Flagged only', 'المُعلَّمة فقط')}
            checked={flaggedOnly}
            onChange={(e) => {
              setFlaggedOnly(e.target.checked);
              setPage(1);
            }}
          />
          <Choice
            type="checkbox"
            label={t('Awaiting COD', 'بانتظار تحصيل الدفع')}
            checked={awaitingCod}
            onChange={(e) => {
              setAwaitingCod(e.target.checked);
              setPage(1);
            }}
          />
          <label>
            <span className="visually-hidden">{t('Filter by status', 'تصفية حسب الحالة')}</span>
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('All statuses', 'كل الحالات')}</option>
              {STATUS_FILTER_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {t(s.en, s.ar)}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>

      {oa.actionError && (
        <Alert tone="danger" className="stack">
          {oa.actionError}
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
              : awaitingCod
                ? t('No orders awaiting COD collection', 'لا طلبات بانتظار تحصيل الدفع')
                : statusFilter
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
                <th>{t('Delivery address', 'عنوان التوصيل')}</th>
                <th className="is-numeric">{t('Items', 'القطع')}</th>
                <th className="is-numeric">{t('Total', 'الإجمالي')}</th>
                <th>{t('Payment', 'الدفع')}</th>
                <th>{t('Status', 'الحالة')}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((o) => {
                const busy = oa.busyId === o.id;
                const collected = o.paymentStatus === 'COLLECTED';
                return (
                  <tr key={o.id} aria-busy={busy || undefined}>
                    {/* Every row now links to a genuinely admin-aware detail
                        view (fix-list.md #4, resolves 2.2) — previously
                        there was no way to see an order's actual line items
                        anywhere in the admin panel, only this table's item
                        *count*. */}
                    <td data-label={t('Order', 'الطلب')}>
                      <Link href={`/${locale}/admin/orders/${o.id}`}>{o.orderNumber}</Link>
                    </td>
                    <td data-label={t('Date', 'التاريخ')}>{date(o.dateCreated)}</td>
                    <td data-label={t('Customer', 'الزبون')}>
                      {o.deliveryName} {o.flaggedForReview && <Badge variant="sale">{t('Flagged', 'معلَّم')}</Badge>}
                      <br />
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--fs-xs)' }}>
                        {o.deliveryPhone}
                        {o.guestEmail ? ` · ${o.guestEmail}` : ''}
                      </span>
                    </td>
                    <td data-label={t('Delivery address', 'عنوان التوصيل')}>
                      <div className="admin-order-address">
                        <span>{o.deliveryAddress}</span>
                        <button
                          type="button"
                          className="admin-order-address__toggle"
                          onClick={() => toggleExpanded(o.id)}
                          aria-expanded={expandedIds.has(o.id)}
                        >
                          <Icon as={ChevronDown} size={14} className={expandedIds.has(o.id) ? 'admin-order-address__chevron is-open' : 'admin-order-address__chevron'} />
                          {t('Details', 'التفاصيل')}
                        </button>
                      </div>
                      {expandedIds.has(o.id) && (
                        <div className="admin-order-address__detail">
                          <span>
                            {[o.deliveryArea, o.deliveryCity, regionLabel(o.deliveryRegion)]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                          {o.deliveryNotes && <span className="admin-order-address__notes">{o.deliveryNotes}</span>}
                        </div>
                      )}
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
                      {Number(o.discountAmount ?? 0) > 0 && (
                        <span className="admin-order-discount">
                          −{money(Number(o.discountAmount))}
                          {o.couponCode ? ` · ${o.couponCode}` : ''}
                        </span>
                      )}
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
                            onClick={() => oa.toggleCollected(o, !collected)}
                          >
                            {collected ? t('Mark unpaid', 'إلغاء التحصيل') : t('Mark collected', 'تم التحصيل')}
                          </Button>
                        )}
                        {o.paymentMethod === 'COD' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => printReceipt(o)}
                            title={
                              printerName
                                ? t(`Print a delivery receipt — select "${printerName}" in the dialog`, `طباعة إيصال توصيل — اختر "${printerName}" من نافذة الطباعة`)
                                : t('Print a delivery receipt to give the customer', 'طباعة إيصال توصيل لتسليمه للزبون')
                            }
                          >
                            <Icon as={Printer} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
                            {t('Print receipt', 'طباعة الإيصال')}
                          </Button>
                        )}
                      </span>
                    </td>
                    <td data-label={t('Status', 'الحالة')}>
                      <span className="admin-row-actions">
                        <StatusPill status={o.status} locale={locale} />
                        {o.estimatedDeliveryDays != null && (
                          <button
                            type="button"
                            className="admin-order-eta"
                            onClick={() => oa.openDaysModal(o, 'edit')}
                            disabled={busy}
                            title={t('Edit the delivery estimate', 'تعديل مدة التوصيل')}
                          >
                            {t(
                              `~${o.estimatedDeliveryDays}d`,
                              `~${o.estimatedDeliveryDays} يوم`
                            )}
                          </button>
                        )}
                        {o.flaggedForReview && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => oa.markReviewed(o)}
                          >
                            {t('Mark reviewed', 'وضع علامة كمُراجَع')}
                          </Button>
                        )}
                        <Select
                          aria-label={t(`Change status for ${o.orderNumber}`, `تغيير حالة ${o.orderNumber}`)}
                          value={o.status}
                          disabled={busy}
                          onChange={(e) => oa.changeStatus(o, e.target.value as OrderStatus)}
                        >
                          {ORDER_STATUSES.map((s) => (
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

      <OrderActionModals locale={locale} oa={oa} />

      {printSettingsOpen && (
        <Modal
          open
          onClose={() => setPrintSettingsOpen(false)}
          title={t('Print settings', 'إعدادات الطباعة')}
          closeLabel={t('Close', 'إغلاق')}
        >
          <div className="admin-modal">
            <p className="admin-form__hint" style={{ margin: 0 }}>
              {t(
                "Saved on this device only — different tills/computers can have different receipt printers.",
                'تُحفظ على هذا الجهاز فقط — قد تختلف طابعة الإيصالات من جهاز/كاشير لآخر.'
              )}
            </p>
            <Field
              label={t('Receipt format', 'شكل الإيصال')}
              hint={t(
                'Compact prints a narrow, supermarket till-style receipt instead of a full page.',
                'الشكل المضغوط يطبع إيصالاً ضيقًا على طراز أجهزة الكاشير بدلاً من صفحة كاملة.'
              )}
            >
              {(p) => (
                <Select
                  {...p}
                  value={receiptFormat}
                  onChange={(e) => setReceiptFormat(e.target.value as ReceiptFormat)}
                >
                  <option value="standard">{t('Standard (full page)', 'عادي (صفحة كاملة)')}</option>
                  <option value="compact">{t('Compact (thermal receipt)', 'مضغوط (إيصال حراري)')}</option>
                </Select>
              )}
            </Field>
            <Field
              label={t('Preferred printer', 'الطابعة المفضّلة')}
              hint={t(
                "A reminder shown next to \"Print receipt\" — a website can't select a printer for you, so your browser's print dialog still lists every connected printer to pick from manually.",
                'تذكير يظهر بجانب "طباعة الإيصال" — لا يمكن لموقع اختيار الطابعة تلقائيًا، لذا ستظل نافذة الطباعة تعرض كل الطابعات المتصلة لاختيار إحداها يدويًا.'
              )}
            >
              {(p) => (
                <Input
                  {...p}
                  value={printerName}
                  onChange={(e) => setPrinterName(e.target.value)}
                  placeholder={t('e.g. Epson TM-T20 (till 1)', 'مثال: طابعة الكاشير 1')}
                />
              )}
            </Field>
            <div className="admin-modal__actions">
              <Button variant="primary" onClick={() => setPrintSettingsOpen(false)}>
                {t('Done', 'تم')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {receiptNode}
    </div>
  );
}
