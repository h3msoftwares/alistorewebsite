'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Printer, Settings2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
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
import { OrderReceipt } from '@/components/orders/order-receipt';
import { useAdminOrders, useMarkOrderCollected, useReviewOrder, useUpdateOrderStatus } from '@/hooks/use-orders';
import { usePrintPreferences } from '@/hooks/use-print-preferences';
import { useSettings } from '@/hooks/use-settings';
import { useStepUp } from '@/hooks/use-auth';
import { isApiError } from '@/lib/api';
import { DELIVERY_REGIONS } from '@/lib/regions';
import type { ReceiptFormat } from '@/lib/print-preferences';
import { DEFAULT_BRAND_NAME_AR, DEFAULT_BRAND_NAME_EN } from '@/lib/site';
import { usePermissions } from '@/lib/rbac';
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

// Status changes that get a confirmation modal (both are effectively
// terminal; CANCELLED also restocks + emails the customer).
const CONFIRM_STATUSES: OrderStatus[] = ['CANCELLED', 'RETURNED'];

/** What the admin is mid-way through doing — drives which modal is open. */
type PendingAction =
  | { kind: 'confirm'; order: Order; status: OrderStatus }
  | { kind: 'days'; order: Order; status: OrderStatus; mode: 'ship' | 'edit' };

export default function AdminOrdersPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const canManageBlacklist = usePermissions().has('orders:manage');
  const { data: settings } = useSettings();
  const brandName = settings ? (isAr ? settings.brandNameAr : settings.brandNameEn) : isAr ? DEFAULT_BRAND_NAME_AR : DEFAULT_BRAND_NAME_EN;
  const { receiptFormat, printerName, setReceiptFormat, setPrinterName } = usePrintPreferences();
  const [printSettingsOpen, setPrintSettingsOpen] = useState(false);

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
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [daysInput, setDaysInput] = useState('');
  const [daysError, setDaysError] = useState<string | null>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);

  // Fires window.print() once <OrderReceipt> below has mounted with the
  // picked order — printing synchronously inside the click handler would
  // race that render, so this waits a frame instead. `afterprint` clears
  // the selection whether the admin actually printed or cancelled the
  // dialog.
  useEffect(() => {
    if (!printOrder) return;
    const raf = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(raf);
  }, [printOrder]);
  useEffect(() => {
    const onAfterPrint = () => setPrintOrder(null);
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);
  // A sensitive write (status change, collected toggle, ...) came back
  // 403 STEP_UP_REQUIRED — the session is stale, not wrong. We stash the
  // exact retry so a correct password re-runs the original action instead
  // of making the admin redo the click, and the only alternative used to be
  // a full logout/login.
  const [stepUpPrompt, setStepUpPrompt] = useState<{ id: string; fn: () => Promise<unknown>; failMsg: string } | null>(null);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [stepUpError, setStepUpError] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useAdminOrders(status || undefined, flaggedOnly || undefined);
  const updateStatus = useUpdateOrderStatus();
  const markCollected = useMarkOrderCollected();
  const reviewOrder = useReviewOrder();
  const stepUp = useStepUp();

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
      if (isApiError(e) && e.code === 'STEP_UP_REQUIRED') {
        setStepUpPrompt({ id, fn, failMsg });
      } else {
        setActionError(e instanceof Error ? e.message : failMsg);
      }
    } finally {
      setBusyId(null);
    }
  };

  const closeStepUp = () => {
    setStepUpPrompt(null);
    setStepUpPassword('');
    setStepUpError(null);
  };

  const submitStepUp = async () => {
    if (!stepUpPrompt) return;
    setStepUpError(null);
    try {
      await stepUp.mutateAsync(stepUpPassword);
    } catch {
      setStepUpError(t('Incorrect password.', 'كلمة المرور غير صحيحة.'));
      return;
    }
    const { id, fn, failMsg } = stepUpPrompt;
    closeStepUp();
    await run(id, fn, failMsg);
  };

  const openDaysModal = (o: Order, mode: 'ship' | 'edit') => {
    setDaysInput(o.estimatedDeliveryDays != null ? String(o.estimatedDeliveryDays) : '');
    setDaysError(null);
    setPending({ kind: 'days', order: o, status: mode === 'ship' ? 'SHIPPED' : o.status, mode });
  };

  // Called from the row's status <Select>. Confirmable statuses and the first
  // move to SHIPPED open a modal; everything else applies immediately.
  const changeStatus = (o: Order, next: OrderStatus) => {
    if (next === o.status) return;
    if (CONFIRM_STATUSES.includes(next)) {
      setPending({ kind: 'confirm', order: o, status: next });
      return;
    }
    if (next === 'SHIPPED') {
      openDaysModal(o, 'ship');
      return;
    }
    run(
      o.id,
      () => updateStatus.mutateAsync({ id: o.id, status: next }),
      t('Status change failed', 'فشل تغيير الحالة')
    );
  };

  const closeModal = () => setPending(null);

  const confirmStatusChange = async () => {
    if (pending?.kind !== 'confirm') return;
    const { order, status: next } = pending;
    closeModal();
    await run(
      order.id,
      () => updateStatus.mutateAsync({ id: order.id, status: next }),
      t('Status change failed', 'فشل تغيير الحالة')
    );
  };

  const submitDays = async () => {
    if (pending?.kind !== 'days') return;
    const trimmed = daysInput.trim();
    let estimatedDeliveryDays: number | null;
    if (trimmed === '') {
      estimatedDeliveryDays = null;
    } else {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0 || n > 90) {
        setDaysError(t('Enter a whole number of days (0–90), or leave blank.', 'أدخل عدد أيام صحيح (0–90)، أو اتركه فارغًا.'));
        return;
      }
      estimatedDeliveryDays = n;
    }
    const { order, status: next } = pending;
    closeModal();
    await run(
      order.id,
      () => updateStatus.mutateAsync({ id: order.id, status: next, estimatedDeliveryDays }),
      t('Update failed', 'فشل التحديث')
    );
  };

  const itemCount = (o: Order) => o.items.reduce((n, i) => n + i.quantity, 0);
  const regionLabel = (value?: string | null) => {
    const r = DELIVERY_REGIONS.find((x) => x.value === value);
    return r ? (isAr ? r.ar : r.en) : (value ?? '');
  };

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Orders', 'الطلبات')}</h1>
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
          {canManageBlacklist && (
            <Link href={`/${locale}/admin/orders/blacklist`} className="btn btn--outline">
              {t('Blacklist', 'قائمة الحظر')}
            </Link>
          )}
          <Button variant="outline" onClick={() => setPrintSettingsOpen(true)}>
            <Icon as={Settings2} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
            {t('Print settings', 'إعدادات الطباعة')}
          </Button>
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
                <th>{t('Delivery address', 'عنوان التوصيل')}</th>
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
                      {o.deliveryAddress}
                      <br />
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--fs-xs)' }}>
                        {[o.deliveryArea, o.deliveryCity, regionLabel(o.deliveryRegion)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {o.deliveryNotes && (
                        <>
                          <br />
                          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--fs-xs)', fontStyle: 'italic' }}>
                            {o.deliveryNotes}
                          </span>
                        </>
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
                        {o.paymentMethod === 'COD' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPrintOrder(o)}
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
                            onClick={() => openDaysModal(o, 'edit')}
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
                          onChange={(e) => changeStatus(o, e.target.value as OrderStatus)}
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

      {pending?.kind === 'confirm' && (
        <Modal
          open
          onClose={closeModal}
          title={t(`Change status of ${pending.order.orderNumber}`, `تغيير حالة ${pending.order.orderNumber}`)}
          closeLabel={t('Close', 'إغلاق')}
        >
          <div className="admin-modal">
            <h2 className="admin-modal__title">
              {pending.status === 'CANCELLED'
                ? t('Cancel this order?', 'إلغاء هذا الطلب؟')
                : t('Mark this order as returned?', 'وضع علامة "مُرتجَع" على هذا الطلب؟')}
            </h2>
            <p className="admin-modal__body">
              {pending.status === 'CANCELLED'
                ? t(
                    `Order ${pending.order.orderNumber} will be cancelled — its items go back into stock and the customer is emailed.`,
                    `سيُلغى الطلب ${pending.order.orderNumber} — تُعاد قطعه إلى المخزون ويُرسَل بريد إلى الزبون.`
                  )
                : t(
                    `Order ${pending.order.orderNumber} will be marked as returned.`,
                    `سيوضع على الطلب ${pending.order.orderNumber} علامة "مُرتجَع".`
                  )}
            </p>
            <div className="admin-modal__actions">
              <Button variant="ghost" onClick={closeModal}>
                {t('Keep as is', 'الإبقاء كما هو')}
              </Button>
              <Button
                variant={pending.status === 'CANCELLED' ? 'danger' : 'primary'}
                onClick={confirmStatusChange}
              >
                {pending.status === 'CANCELLED'
                  ? t('Cancel order', 'إلغاء الطلب')
                  : t('Mark returned', 'وضع علامة مُرتجَع')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {pending?.kind === 'days' && (
        <Modal
          open
          onClose={closeModal}
          title={t('Delivery estimate', 'مدة التوصيل المتوقعة')}
          closeLabel={t('Close', 'إغلاق')}
        >
          <form
            className="admin-modal"
            onSubmit={(e) => {
              e.preventDefault();
              void submitDays();
            }}
          >
            <h2 className="admin-modal__title">
              {pending.mode === 'ship'
                ? t(`Ship order ${pending.order.orderNumber}`, `شحن الطلب ${pending.order.orderNumber}`)
                : t(`Delivery estimate — ${pending.order.orderNumber}`, `مدة التوصيل — ${pending.order.orderNumber}`)}
            </h2>
            <Field
              label={t('Arrives in about (days)', 'يصل خلال (أيام)')}
              hint={t(
                'Leave blank if unknown. Shown to the customer in the shipped email.',
                'اتركه فارغًا إن لم يكن معروفًا. يظهر للزبون في بريد الشحن.'
              )}
              error={daysError ?? undefined}
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  max={90}
                  step={1}
                  inputMode="numeric"
                  value={daysInput}
                  onChange={(e) => setDaysInput(e.target.value)}
                  placeholder={t('e.g. 3', 'مثال: 3')}
                />
              )}
            </Field>
            <div className="admin-modal__actions">
              <Button type="button" variant="ghost" onClick={closeModal}>
                {t('Cancel', 'إلغاء')}
              </Button>
              <Button type="submit" variant="primary">
                {pending.mode === 'ship' ? t('Ship order', 'شحن الطلب') : t('Save estimate', 'حفظ المدة')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

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

      {printOrder && <OrderReceipt order={printOrder} locale={locale} brandName={brandName} format={receiptFormat} />}

      {stepUpPrompt && (
        <Modal
          open
          onClose={closeStepUp}
          title={t('Re-enter your password', 'أعد إدخال كلمة المرور')}
          closeLabel={t('Close', 'إغلاق')}
        >
          <form
            className="admin-modal"
            onSubmit={(e) => {
              e.preventDefault();
              void submitStepUp();
            }}
          >
            <h2 className="admin-modal__title">{t('Re-enter your password', 'أعد إدخال كلمة المرور')}</h2>
            <p className="admin-modal__body">
              {t(
                'Your session needs a fresh password check before making this change.',
                'يحتاج جلستك إلى تحقق حديث من كلمة المرور قبل إجراء هذا التغيير.'
              )}
            </p>
            <Field label={t('Password', 'كلمة المرور')}>
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoFocus
                  value={stepUpPassword}
                  onChange={(e) => setStepUpPassword(e.target.value)}
                  disabled={stepUp.isPending}
                />
              )}
            </Field>
            {stepUpError && <Alert tone="danger">{stepUpError}</Alert>}
            <div className="admin-modal__actions">
              <Button type="button" variant="ghost" onClick={closeStepUp} disabled={stepUp.isPending}>
                {t('Cancel', 'إلغاء')}
              </Button>
              <Button type="submit" variant="primary" loading={stepUp.isPending} disabled={!stepUpPassword}>
                {t('Confirm', 'تأكيد')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
