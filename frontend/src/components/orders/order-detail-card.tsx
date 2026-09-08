'use client';

import { Alert, Button, StatusPill } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { regionLabel } from '@/lib/regions';
import type { Order } from '@/lib/types';

type Locale = 'en' | 'ar';

// A customer (or a guest bearing a valid tracking token) may cancel up to —
// but not including — SHIPPED. Mirrors CANCELLABLE_STATUSES in
// order.service.ts; kept here as the single frontend copy of that same rule
// rather than re-deriving it from the full OrderStatus union.
const CANCELLABLE_STATUSES: Order['status'][] = ['PENDING', 'CONFIRMED'];

/**
 * Renders one order's items/delivery/total and, when cancellable, a Cancel
 * button — shared by the logged-in detail page (/orders/[id]) and the guest
 * tracking page (/orders/track/[token]), which differ only in how they
 * prove access (session vs. token) and therefore in what `onCancel` does.
 */
export function OrderDetailCard({
  locale,
  order,
  onCancel,
  cancelling,
  cancelError,
}: {
  locale: Locale;
  order: Order;
  onCancel?: () => void;
  cancelling?: boolean;
  cancelError?: string | null;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const money = (n: number) => formatCurrency(n, locale);

  const canCancel = Boolean(onCancel) && CANCELLABLE_STATUSES.includes(order.status);

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
    </div>
  );
}
