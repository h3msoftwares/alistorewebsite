'use client';

import { useState } from 'react';
import { Alert, Button, Choice, QuantityStepper, StatusPill, Textarea } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { colorLabel } from '@/lib/product-variants';
import { regionLabel } from '@/lib/regions';
import { OrderReturnIndicators } from './order-return-indicators';
import { calculatedMerchandiseCents, effectiveMerchandiseCents, wasRefundAdjusted } from '@/lib/refund-amounts';
import type { CreateReturnBody, Order, ReturnStatus, ReturnPreview, RefundCalculation } from '@/lib/types';

type Locale = 'en' | 'ar';

// A customer (or a guest bearing a valid tracking token) may cancel up to —
// but not including — SHIPPED. Mirrors CANCELLABLE_STATUSES in
// order.service.ts; kept here as the single frontend copy of that same rule
// rather than re-deriving it from the full OrderStatus union.
const CANCELLABLE_STATUSES: Order['status'][] = ['PENDING', 'CONFIRMED'];

// A Return can be withdrawn any time before the item is actually back —
// mirrors LEGAL_TRANSITIONS' "→ CANCELLED" edges in return.service.ts.
const CANCELLABLE_RETURN_STATUSES: ReturnStatus[] = ['REQUESTED', 'APPROVED', 'IN_TRANSIT'];

// No shared, ReturnStatus-typed status-pill component exists (StatusPill is
// hard-typed to OrderStatus) — reusing the same `.status--*` tone classes
// directly is the established pattern elsewhere (e.g. the Discounts admin
// page's own promotion-status pill).
const RETURN_STATUS_CLASS: Record<ReturnStatus, string> = {
  REQUESTED: 'status--pending',
  APPROVED: 'status--confirmed',
  IN_TRANSIT: 'status--shipped',
  RECEIVED: 'status--delivered',
  REFUNDED: 'status--delivered',
  REJECTED: 'status--cancelled',
  CANCELLED: 'status--cancelled',
};
const RETURN_STATUS_LABEL: Record<ReturnStatus, { en: string; ar: string }> = {
  REQUESTED: { en: 'Requested', ar: 'قيد الطلب' },
  APPROVED: { en: 'Approved', ar: 'مقبول' },
  IN_TRANSIT: { en: 'In transit', ar: 'في الطريق' },
  RECEIVED: { en: 'Received', ar: 'تم الاستلام' },
  REFUNDED: { en: 'Refunded', ar: 'مسترد' },
  REJECTED: { en: 'Rejected', ar: 'مرفوض' },
  CANCELLED: { en: 'Cancelled', ar: 'مُلغى' },
};

function RefundExplanation({ calculation: c, locale }: { calculation: RefundCalculation; locale: Locale }) {
  const t = (en: string, ar: string) => locale === 'ar' ? ar : en;
  const money = (cents: number) => formatCurrency(cents / 100, locale);
  const rows = [
    [t('Original amount paid for this line', 'المبلغ الأصلي المدفوع لهذا البند'), c.originalNetCents],
    [t(`Price of ${c.keptQuantity} kept unit(s), before coupon`, `سعر ${c.keptQuantity} وحدات محتفظ بها قبل القسيمة`), c.keptGrossCents],
    [t('Kept amount after preserved coupon', 'المبلغ المحتفظ به بعد القسيمة الأصلية'), c.keptNetCents],
    [t('Proportional value of all returned units', 'القيمة النسبية لجميع الوحدات المرتجعة'), c.proportionalRefundCents],
    [t('Quantity-discount adjustment (deducted)', 'تعديل خصم الكمية (يُخصم)'), c.quantityDiscountAdjustmentCents],
    [t('Previously calculated refund amounts', 'مبالغ الاسترداد المحسوبة سابقاً'), c.previousRefundCents],
    ...(c.reservedRefundCents > 0 ? [[t('Other pending refunds (reserved)', 'مبالغ طلبات إرجاع أخرى معلّقة'), c.reservedRefundCents] as const] : []),
    [t('Refund for this request', 'المبلغ المسترد لهذا الطلب'), c.refundCents],
  ] as const;
  return <div className="stack" style={{ marginBlock: 'var(--space-2)' }}>
    {rows.map(([label, cents]) => <div className="checkout__row" key={label}><span>{label}</span><span className="is-numeric">{money(cents)}</span></div>)}
    {c.refundCents === 0 && <p>{t('This return has no refundable amount after the quantity-discount adjustment.', 'لا ينتج عن هذا الإرجاع مبلغ مسترد بعد تعديل خصم الكمية.')}</p>}
  </div>;
}

/**
 * Renders one order's items/delivery/total, a Cancel button when
 * cancellable, a "Request a return" form when delivered, and a read-only
 * summary of any existing per-item Return requests — shared by the
 * logged-in detail page (/orders/[id]), the guest tracking page
 * (/orders/track/[token]), and (read-only, no callbacks passed) the admin
 * order-detail page, which differ only in how they prove access.
 */
export function OrderDetailCard({
  locale,
  order,
  onCancel,
  cancelling,
  cancelError,
  onRequestReturn,
  onPreviewReturn,
  requestingReturn,
  requestReturnError,
  onCancelReturn,
  cancellingReturnId,
  audience = 'customer',
}: {
  locale: Locale;
  order: Order;
  onCancel?: () => void;
  cancelling?: boolean;
  cancelError?: string | null;
  onRequestReturn?: (body: CreateReturnBody) => void;
  onPreviewReturn?: (body: CreateReturnBody) => Promise<ReturnPreview>;
  requestingReturn?: boolean;
  requestReturnError?: string | null;
  onCancelReturn?: (returnId: string) => void;
  cancellingReturnId?: string | null;
  audience?: 'admin' | 'customer';
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const money = (n: number) => formatCurrency(n, locale);

  const canCancel = Boolean(onCancel) && CANCELLABLE_STATUSES.includes(order.status);

  const [showReturnForm, setShowReturnForm] = useState(false);
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<{ key: string; value: ReturnPreview } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewKey = JSON.stringify([selectedQty, order.returns]);
  const currentPreview = preview?.key === previewKey ? preview.value : null;
  const affected = (i: Order['items'][number]) => i.priceBreakdown?.version === 2
    && (i.priceBreakdown.rule != null || (i.priceBreakdown.couponDiscountCents ?? 0) > 0);
  const unresolved = new Set((order.returns ?? []).filter((r) => !['REFUNDED', 'REJECTED', 'CANCELLED'].includes(r.status))
    .flatMap((r) => r.items.map((i) => i.orderItemID)));

  const returnableItems = order.items.filter((i) => i.quantity - i.returnedQuantity > 0 && !(affected(i) && unresolved.has(i.id)));
  const canRequestReturn = Boolean(onRequestReturn) && order.status === 'DELIVERED' && returnableItems.length > 0;
  const selectedItems = returnableItems.filter((i) => selectedQty[i.id] > 0)
    .map((i) => ({ orderItemID: i.id, quantity: Math.min(selectedQty[i.id], i.quantity - i.returnedQuantity) }));

  const toggleItem = (itemId: string, remaining: number) => {
    setSelectedQty((prev) => {
      const next = { ...prev };
      if (next[itemId]) delete next[itemId];
      else next[itemId] = remaining;
      return next;
    });
  };

  const requestBody = () => ({
    items: selectedItems,
    reason: reason.trim() || undefined,
  });
  const loadPreview = async () => {
    if (!onPreviewReturn) return;
    setPreviewError(null);
    setPreviewing(true);
    setPreview(null);
    try {
      const value = await onPreviewReturn(requestBody());
      setPreview({ key: previewKey, value });
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : t('Could not calculate the refund.', 'تعذّر حساب المبلغ المسترد.'));
    } finally {
      setPreviewing(false);
    }
  };
  const submitReturn = () => {
    const body = requestBody();
    if (!body.items.length || !onRequestReturn || (onPreviewReturn && !currentPreview)) return;
    onRequestReturn({ ...body, ...(currentPreview ? { expectedRefundCents: currentPreview.refundCents } : {}) });
  };

  return (
    <div className="stack">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <h2 style={{ fontSize: 'var(--fs-md)', margin: 0 }}>{order.orderNumber}</h2>
        <StatusPill status={order.status} locale={locale} />
      </div>

      {order.status === 'CANCELLED' && (
        <Alert tone="warning">{t('This order was cancelled.', 'تم إلغاء هذا الطلب.')}</Alert>
      )}

      <ul className="checkout__lines">
        {order.items.map((i) => {
          const variantBits = [i.size, i.color ? colorLabel(i.color, locale) : null].filter(Boolean).join(' / ');
          return (
            <li key={i.id}>
              <span>
                {i.productName}
                {variantBits ? ` (${variantBits})` : ''} × {i.quantity}
              </span>
              <span className="is-numeric">{money(Number(i.lineTotal))}</span>
            </li>
          );
        })}
      </ul>

      <div className="checkout__row">
        <span>{t('Subtotal', 'المجموع الفرعي')}</span>
        <span className="is-numeric">{money(Number(order.subtotal))}</span>
      </div>
      {Number(order.discountAmount ?? 0) > 0 && (
        <div className="checkout__row">
          <span>
            {t('Discount', 'الخصم')}
            {order.couponCode ? ` (${order.couponCode})` : ''}
          </span>
          <span className="is-numeric">−{money(Number(order.discountAmount))}</span>
        </div>
      )}
      {order.items.some(affected) && <p className="admin-form__hint">
        {t('Partial returns can reduce your quantity discount. We reprice the units you keep using the rates and sale/promotion price from your purchase, preserve your coupon percentage, and deduct prior refunds. The adjustment is shown before you submit.',
          'قد يقل خصم الكمية عند الإرجاع الجزئي. نعيد حساب سعر الوحدات المحتفظ بها بأسعار الشراء الأصلية والتخفيضات والعروض وقت الشراء، مع الحفاظ على نسبة القسيمة وطرح المبالغ المستردة سابقاً. يظهر التعديل قبل إرسال الطلب.')}
      </p>}
      {order.items.some((i) => affected(i) && unresolved.has(i.id) && i.quantity > i.returnedQuantity) && <p>
        {t('Finish or withdraw the existing return before requesting another return for the same discounted line.', 'أكمل طلب الإرجاع الحالي أو اسحبه قبل طلب إرجاع آخر لنفس البند المخفّض.')}
      </p>}
      <div className="checkout__row">
        <span>{t('Delivery', 'التوصيل')}</span>
        <span className="is-numeric">
          {Number(order.deliveryFee) === 0 ? t('Free', 'مجاني') : money(Number(order.deliveryFee))}
        </span>
      </div>
      <div className="checkout__row checkout__row--total">
        <span>{t('Total', 'الإجمالي')}</span>
        <span className="is-numeric">{money(Number(order.total))}</span>
      </div>

      <div className="prose" style={{ marginBlockStart: 'var(--space-3)' }}>
        <strong>{t('Delivering to', 'يُسلَّم إلى')}</strong>
        <br />
        {order.deliveryName}
        <br />
        {order.deliveryAddress}
        {[order.deliveryArea, order.deliveryCity, order.deliveryRegion ? regionLabel(order.deliveryRegion, locale) : null]
          .filter(Boolean)
          .map((part) => `, ${part}`)
          .join('')}
        <br />
        {t('Phone', 'الهاتف')}: {order.deliveryPhone}
        {order.deliveryNotes && (
          <>
            <br />
            {t('Notes', 'ملاحظات')}: {order.deliveryNotes}
          </>
        )}
      </div>

      {cancelError && <Alert tone="danger">{cancelError}</Alert>}

      {canCancel && (
        <div className="admin-form__actions">
          <Button type="button" variant="ghost" loading={cancelling} onClick={onCancel}>
            {t('Cancel order', 'إلغاء الطلب')}
          </Button>
        </div>
      )}

      <OrderReturnIndicators indicators={order.returnIndicators} locale={locale} customer={audience === 'customer'} />
      {audience === 'customer' && (order.goodwillRefunds ?? []).filter(g => g.status === 'PAID').map(g =>
        <p key={g.id}>{t('Refund from the store', 'استرداد من المتجر')}: {money(Number(g.amount))}</p>)}
      {order.returns != null && order.returns.length > 0 && (
        <div className="stack" style={{ marginBlockStart: 'var(--space-4)' }}>
          <strong>{t('Returns', 'المرتجعات')}</strong>
          {order.returns.map((r) => (
            <div key={r.id} className="prose" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                <span className={`status ${RETURN_STATUS_CLASS[r.status]}`}>
                  {isAr ? RETURN_STATUS_LABEL[r.status].ar : RETURN_STATUS_LABEL[r.status].en}
                </span>
                <span className="is-numeric">{money(effectiveMerchandiseCents(r) / 100)}</span>
              </div>
              {r.status === 'REFUNDED' && audience === 'admin' && <>
                <p>{t('Calculated merchandise amount', 'مبلغ البضائع المحسوب')}: {money(calculatedMerchandiseCents(r) / 100)}</p>
                <p>{t('Effective merchandise refunded', 'مبلغ البضائع الفعلي المسترد')}: {money(effectiveMerchandiseCents(r) / 100)}</p>
                {r.refundAdjustmentReason && <p>{t('Adjustment reason', 'سبب التعديل')}: {r.refundAdjustmentReason}</p>}
              </>}
              {audience === 'customer' && wasRefundAdjusted(r) && <p>{t('Adjusted by the store', 'عُدّل بواسطة المتجر')}</p>}
              {Number(r.deliveryRefundAmount ?? 0) > 0 && <p>{t('Delivery refunded', 'التوصيل المسترد')}: {money(Number(r.deliveryRefundAmount))}
                {audience === 'admin' && r.deliveryRefundReason && <> — {r.deliveryRefundReason}</>}
              </p>}
              <ul className="checkout__lines">
                {r.items.map((ri) => {
                  const orderLine = order.items.find((i) => i.id === ri.orderItemID);
                  return (
                    <li key={ri.id} style={{ display: 'block' }}>
                      <div className="checkout__row">
                      <span>{orderLine?.productName ?? ri.orderItem?.productName} × {ri.quantity}</span>
                      <span className="is-numeric">{money(Number(r.status === 'REFUNDED' ? ri.refundedAmount ?? ri.refundAmount : ri.refundAmount))}</span>
                      </div>
                      {ri.refundBreakdown && !wasRefundAdjusted(r) && <RefundExplanation calculation={ri.refundBreakdown} locale={locale} />}
                    </li>
                  );
                })}
              </ul>
              {r.reason && <p style={{ margin: 0 }}>{t('Reason', 'السبب')}: {r.reason}</p>}
              {onCancelReturn && CANCELLABLE_RETURN_STATUSES.includes(r.status) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={cancellingReturnId === r.id}
                  onClick={() => onCancelReturn(r.id)}
                >
                  {t('Withdraw request', 'سحب الطلب')}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {canRequestReturn && (
        <div className="stack" style={{ marginBlockStart: 'var(--space-4)' }}>
          {!showReturnForm ? (
            <Button type="button" variant="outline" onClick={() => setShowReturnForm(true)}>
              {t('Request a return', 'طلب إرجاع')}
            </Button>
          ) : (
            <div className="admin-form__section">
              <p className="admin-form__section-title">{t('Request a return', 'طلب إرجاع')}</p>
              {returnableItems.map((i) => {
                const remaining = i.quantity - i.returnedQuantity;
                const checked = Boolean(selectedQty[i.id]);
                const itemVariantBits = [i.size, i.color ? colorLabel(i.color, locale) : null]
                  .filter(Boolean)
                  .join(' / ');
                return (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <Choice
                      type="checkbox"
                      label={`${i.productName}${itemVariantBits ? ` (${itemVariantBits})` : ''}`}
                      checked={checked}
                      onChange={() => toggleItem(i.id, remaining)}
                    />
                    {checked && (
                      <QuantityStepper
                        value={Math.min(selectedQty[i.id], remaining)}
                        onChange={(next) => setSelectedQty((prev) => ({ ...prev, [i.id]: next }))}
                        min={1}
                        max={remaining}
                        label={t(`Quantity for ${i.productName}`, `الكمية لـ ${i.productName}`)}
                      />
                    )}
                  </div>
                );
              })}
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('Reason (optional)', 'السبب (اختياري)')}
                rows={2}
              />
              {requestReturnError && <Alert tone="danger">{requestReturnError}</Alert>}
              {previewError && <Alert tone="danger">{previewError}</Alert>}
              {onPreviewReturn && <Button type="button" variant="outline" loading={previewing}
                disabled={!selectedItems.length || requestingReturn} onClick={loadPreview}>
                {t('Preview refund', 'معاينة المبلغ المسترد')}
              </Button>}
              {currentPreview && <div className="stack" aria-label={t('Refund preview', 'معاينة الاسترداد')}>
                {currentPreview.items.map((item) => <div key={item.orderItemID}>
                  <strong>{item.productName} × {item.quantity}</strong>
                  {item.refundBreakdown ? <RefundExplanation calculation={item.refundBreakdown} locale={locale} />
                    : <p>{t('Refund', 'المبلغ المسترد')}: {money(item.refundCents / 100)}</p>}
                </div>)}
                <div className="checkout__row checkout__row--total"><span>{t('Total refund', 'إجمالي الاسترداد')}</span><span>{money(currentPreview.refundCents / 100)}</span></div>
                <p>{t('Preview only. Availability and refund are checked again when you submit.', 'هذه معاينة فقط. يُعاد التحقق من أهلية الإرجاع والمبلغ عند الإرسال.')}</p>
              </div>}
              <div className="admin-form__actions">
                <Button
                  type="button"
                  loading={requestingReturn}
                  disabled={!selectedItems.length || previewing || Boolean(onPreviewReturn && !currentPreview)}
                  onClick={submitReturn}
                >
                  {t('Submit return request', 'إرسال طلب الإرجاع')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowReturnForm(false)}>
                  {t('Cancel', 'إلغاء')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
