'use client';

import { useState } from 'react';
import { Alert, Button, Choice, QuantityStepper, StatusPill, Textarea } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { regionLabel } from '@/lib/regions';
import type { CreateReturnBody, Order, ReturnStatus } from '@/lib/types';

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
  REFUNDED: { en: 'Refunded', ar: 'تم الاسترداد' },
  REJECTED: { en: 'Rejected', ar: 'مرفوض' },
  CANCELLED: { en: 'Cancelled', ar: 'مُلغى' },
};

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
  requestingReturn,
  requestReturnError,
  onCancelReturn,
  cancellingReturnId,
}: {
  locale: Locale;
  order: Order;
  onCancel?: () => void;
  cancelling?: boolean;
  cancelError?: string | null;
  onRequestReturn?: (body: CreateReturnBody) => void;
  requestingReturn?: boolean;
  requestReturnError?: string | null;
  onCancelReturn?: (returnId: string) => void;
  cancellingReturnId?: string | null;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const money = (n: number) => formatCurrency(n, locale);

  const canCancel = Boolean(onCancel) && CANCELLABLE_STATUSES.includes(order.status);

  const [showReturnForm, setShowReturnForm] = useState(false);
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');

  const returnableItems = order.items.filter((i) => i.quantity - i.returnedQuantity > 0);
  const canRequestReturn = Boolean(onRequestReturn) && order.status === 'DELIVERED' && returnableItems.length > 0;

  const toggleItem = (itemId: string, remaining: number) => {
    setSelectedQty((prev) => {
      const next = { ...prev };
      if (next[itemId]) delete next[itemId];
      else next[itemId] = remaining;
      return next;
    });
  };

  const submitReturn = () => {
    const items = Object.entries(selectedQty)
      .filter(([, quantity]) => quantity > 0)
      .map(([orderItemID, quantity]) => ({ orderItemID, quantity }));
    if (items.length === 0 || !onRequestReturn) return;
    onRequestReturn({ items, reason: reason.trim() || undefined });
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
          const variantBits = [i.size, i.color].filter(Boolean).join(' / ');
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

      {order.returns != null && order.returns.length > 0 && (
        <div className="stack" style={{ marginBlockStart: 'var(--space-4)' }}>
          <strong>{t('Returns', 'المرتجعات')}</strong>
          {order.returns.map((r) => (
            <div key={r.id} className="prose" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                <span className={`status ${RETURN_STATUS_CLASS[r.status]}`}>
                  {isAr ? RETURN_STATUS_LABEL[r.status].ar : RETURN_STATUS_LABEL[r.status].en}
                </span>
                {r.refundAmount != null && <span className="is-numeric">{money(Number(r.refundAmount))}</span>}
              </div>
              <ul className="checkout__lines">
                {r.items.map((ri) => {
                  const orderLine = order.items.find((i) => i.id === ri.orderItemID);
                  return (
                    <li key={ri.id}>
                      <span>{orderLine?.productName ?? ri.orderItem?.productName} × {ri.quantity}</span>
                      <span className="is-numeric">{money(Number(ri.refundAmount))}</span>
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
                return (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <Choice
                      type="checkbox"
                      label={`${i.productName}${[i.size, i.color].filter(Boolean).length ? ` (${[i.size, i.color].filter(Boolean).join(' / ')})` : ''}`}
                      checked={checked}
                      onChange={() => toggleItem(i.id, remaining)}
                    />
                    {checked && (
                      <QuantityStepper
                        value={selectedQty[i.id]}
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
              <div className="admin-form__actions">
                <Button
                  type="button"
                  loading={requestingReturn}
                  disabled={Object.values(selectedQty).every((q) => !q)}
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
